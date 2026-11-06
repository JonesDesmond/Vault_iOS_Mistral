import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, uid } from '../db';
import type { SpendingLimit, PaymentMethod } from '../types';
import { CATEGORIES } from '../types';
import { todayISO } from '../lib/dates';
import { exportBackupPlain, exportBackupEncrypted, importBackup, downloadBlob } from '../lib/backup';
import { exportXLSX, exportCSV } from '../lib/export';
import { webauthnAvailable, enrollWebAuthn, unlockWithWebAuthn } from '../lib/webauthn';
import { loadExampleData, removeExampleData, hasExampleData } from '../lib/seed';
import { hashPin } from '../lib/crypto';
import { storagePersistSupported, isIOS } from '../lib/compat';
import { LANGS, t } from '../lib/i18n';
import { AI_PROVIDERS, type AISettings } from '../lib/ai';
import { Field } from '../components/ui';

export default function SettingsScreen() {
  const settings = useLiveQuery(() => getSettings());
  const items = useLiveQuery(() => db.items.toArray());
  const methods = useLiveQuery(() => db.paymentMethods.toArray());
  const [exHas, setExHas] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [pmName, setPmName] = useState('');
  const [pmLast4, setPmLast4] = useState('');
  const [pmType, setPmType] = useState<'card' | 'bank' | 'cash' | 'other'>('card');
  const [pmExpiry, setPmExpiry] = useState('');
  const [limitLabel, setLimitLabel] = useState('');
  const [limitScope, setLimitScope] = useState<SpendingLimit['scope']>('all');
  const [limitCategory, setLimitCategory] = useState(CATEGORIES[0]);
  const [limitMode, setLimitMode] = useState<'fixed' | 'percentOfIncome'>('fixed');
  const [limitAmount, setLimitAmount] = useState('');
  const [limitPercent, setLimitPercent] = useState('');
  const ai: AISettings = settings?.ai ?? { enabled: false, provider: 'mistral', model: '', apiKey: '', baseUrl: '', localMode: 'ollama' };
  const setAi = (patch: Partial<AISettings>) => update({ ai: { ...ai, ...patch } });

  if (!settings || !items || !methods) return <p className="muted">{t('Loading…')}</p>;

  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };
  const update = (patch: Partial<typeof settings>) => db.settings.put({ ...settings, ...patch });
  if (exHas === null) hasExampleData().then(setExHas);

  const savePin = async () => {
    if (pin.length < 4 || pin.length > 6 || pin !== pin2) { say('PIN must be 4–6 digits and match.'); return; }
    const salt = uid();
    await update({ lockEnabled: true, pinSalt: salt, pinHash: await hashPin(salt, pin) });
    setPin(''); setPin2('');
    say('🔒 App lock enabled.');
  };

  const addMethod = async () => {
    if (!pmName.trim() || !/^\d{4}$/.test(pmLast4)) { say('Name required and exactly the LAST 4 digits only (never a full number).'); return; }
    if (pmType === 'card' && pmExpiry && !/^\d{4}-(0[1-9]|1[0-2])$/.test(pmExpiry)) { say('Expiry month must look like 2027-08.'); return; }
    await db.paymentMethods.add({ id: uid(), name: pmName.trim(), last4: pmLast4, type: pmType, expiryMonth: pmType === 'card' && pmExpiry ? pmExpiry : undefined });
    setPmName(''); setPmLast4(''); setPmExpiry('');
    say('Payment method saved (name + last 4 only).');
  };

  const addLimit = async () => {
    if (!limitLabel.trim()) { say('Give the limit a label.'); return; }
    const limit: SpendingLimit = {
      id: uid(), label: limitLabel.trim(), scope: limitScope,
      category: limitScope === 'category' ? limitCategory : undefined,
      mode: limitMode,
      amount: limitMode === 'fixed' ? Number(limitAmount) : undefined,
      percent: limitMode === 'percentOfIncome' ? Number(limitPercent) : undefined
    };
    await update({ limits: [...settings.limits, limit] });
    setLimitLabel(''); setLimitAmount(''); setLimitPercent('');
    say('Limit saved.');
  };

  const doBackup = async (encrypted: boolean) => {
    let blob: Blob;
    if (encrypted) {
      const pw = prompt('Choose a password for the encrypted backup (AES-256):');
      if (!pw) return;
      blob = await exportBackupEncrypted(pw);
      say('Encrypted backup created.');
    } else {
      blob = await exportBackupPlain();
      say('Backup created.');
    }
    downloadBlob(blob, encrypted ? 'receipt-vault-backup-encrypted.json' : 'receipt-vault-backup.json');
    await update({ lastBackupAt: new Date().toISOString() });
  };

  const doRestore = async (file: File) => {
    const encrypted = file.name.includes('encrypted');
    const pw = encrypted ? prompt('Enter the backup password:') ?? '' : undefined;
    try {
      await importBackup(file, pw || undefined);
      say('✅ Backup restored.');
    } catch (e) {
      say('Restore failed: ' + (e as Error).message);
    }
  };

  return (
    <div>
      <h1>⚙️ {t('Settings')}</h1>
      {msg && <div className="banner info" role="status">{msg}</div>}

      <div className="card">
        <h3>{t('Basics')}</h3>
        <div className="field-row">
          <Field label={`${t('Monthly income')} (${settings.currency})`}><input type="number" min="0" step="0.01" value={settings.monthlyIncome ?? ''} onChange={e => update({ monthlyIncome: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
          <Field label={t('Currency')}><input value={settings.currency} maxLength={3} onChange={e => update({ currency: e.target.value.toUpperCase().slice(0, 3) })} /></Field>
        </div>
        <div className="field-row">
          <Field label={t('Theme')}>
            <select value={settings.theme} onChange={e => update({ theme: e.target.value as any })}>
              <option value="system">{t('System')}</option><option value="light">{t('Light')}</option><option value="dark">{t('Dark')}</option>
            </select>
          </Field>
          <Field label={t('Language')}>
            <select value={settings.language || 'en'} onChange={e => update({ language: e.target.value })}>
              {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="card">
        <h3>{t('Spending limits')}</h3>
        <p className="muted">70 / 80 / 90 / 100%</p>
        {settings.limits.map(l => (
          <div className="event-row" key={l.id} style={{ marginBottom: 6 }}>
            <span className="event-title">{l.label} — {l.scope}{l.category ? ` (${l.category})` : ''} — {l.mode === 'fixed' ? `${l.amount} ${settings.currency}` : `${l.percent}% of income`}</span>
            <button className="btn danger icon" onClick={() => update({ limits: settings.limits.filter(x => x.id !== l.id) })}>🗑</button>
          </div>
        ))}
        <div className="field-row">
          <Field label={t('Label')}><input value={limitLabel} onChange={e => setLimitLabel(e.target.value)} placeholder={t('Label')} /></Field>
          <Field label={t('Applies to')}>
            <select value={limitScope} onChange={e => setLimitScope(e.target.value as any)}>
              <option value="all">{t('All payments')}</option><option value="subscriptions">{t('Subscriptions')}</option><option value="contracts">{t('Contracts')}</option><option value="installments">{t('Installments')}</option><option value="category">{t('One category')}</option>
            </select>
          </Field>
        </div>
        {limitScope === 'category' && (
          <Field label={t('Category')}><select value={limitCategory} onChange={e => setLimitCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        )}
        <div className="field-row">
          <Field label={t('Type')}>
            <select value={limitMode} onChange={e => setLimitMode(e.target.value as any)}>
              <option value="fixed">{t('Fixed amount')}</option><option value="percentOfIncome">{t('% of income')}</option>
            </select>
          </Field>
          {limitMode === 'fixed'
            ? <Field label={t('Amount')}><input type="number" min="0" step="0.01" value={limitAmount} onChange={e => setLimitAmount(e.target.value)} /></Field>
            : <Field label={t('Percent of income')}><input type="number" min="0" max="100" value={limitPercent} onChange={e => setLimitPercent(e.target.value)} /></Field>}
        </div>
        <button className="btn" onClick={addLimit}>➕ {t('Add limit')}</button>
      </div>

      <div className="card">
        <h3>{t('Payment methods')}</h3>
        <p className="muted">{t('Only a name and the last 4 digits are stored — never a full number.')}</p>
        {methods.map(m => (
          <div className="event-row" key={m.id} style={{ marginBottom: 6 }}>
            <span className="event-title">{m.name} ••{m.last4} ({m.type}){m.type === 'card' && m.expiryMonth ? ` — ${t('Valid until:')} ${m.expiryMonth}` : ''}</span>
            <button className="btn danger icon" onClick={() => db.paymentMethods.delete(m.id)}>🗑</button>
          </div>
        ))}
        <div className="field-row">
          <Field label={t('Name')}><input value={pmName} onChange={e => setPmName(e.target.value)} placeholder="e.g. Visa" /></Field>
          <Field label={t('Last 4 digits only')}><input inputMode="numeric" maxLength={4} value={pmLast4} onChange={e => setPmLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" /></Field>
        </div>
        <div className="field-row">
          <Field label={t('Type')}>
            <select value={pmType} onChange={e => setPmType(e.target.value as any)}>
              <option value="card">{t('Card')}</option><option value="bank">{t('Bank account (direct debit)')}</option><option value="cash">{t('Cash')}</option><option value="other">{t('Other')}</option>
            </select>
          </Field>
          {pmType === 'card' && <Field label={t('Card expiry month (YYYY-MM)')}><input type="text" inputMode="numeric" placeholder="2027-08" pattern="\d{4}-\d{2}" value={pmExpiry} onChange={e => setPmExpiry(e.target.value)} /></Field>}
        </div>
        <button className="btn" onClick={addMethod}>➕ {t('Add payment method')}</button>
      </div>

      <div className="card">
        <h3>🔒 {t('App lock')}</h3>
        <p className="muted">PIN</p>
        {settings.lockEnabled ? (
          <>
            <p>{t('Lock is enabled.')}</p>
            <div className="btn-row">
              <button className="btn danger" onClick={async () => { const pw = prompt(t('Enter current PIN to disable the lock:') ?? ''); if (pw && settings.pinSalt && await hashPin(settings.pinSalt, pw) === settings.pinHash) { await update({ lockEnabled: false, pinHash: undefined, pinSalt: undefined }); say(t('Lock disabled.')); } else if (pw) say(t('Wrong PIN.')); }}>{t('Disable lock')}</button>
              <button className="btn" onClick={async () => {
                if (!(await webauthnAvailable())) { say(isIOS() ? 'Face ID / Touch ID unlock needs iOS 16.4+ — on iPhone 6s (iOS 15) use the PIN.' : 'No platform authenticator (fingerprint/Face ID) available on this device.'); return; }
                try { await update({ webauthnCredentialId: await enrollWebAuthn(), webauthnEnabled: true }); say('👆 Fingerprint / Face ID enrolled.'); }
                catch (e) { say('Enrolment cancelled/failed: ' + (e as Error).message); }
              }}>{settings.webauthnEnabled ? '👆 ' + t('Enable fingerprint / Face ID') : '👆 ' + t('Enable fingerprint / Face ID')}</button>
              {settings.webauthnEnabled && <button className="btn" onClick={() => update({ webauthnEnabled: false, webauthnCredentialId: undefined })}>{t('Disable biometric')}</button>}
            </div>
          </>
        ) : (
          <>
            <div className="field-row">
              <Field label={t('Choose PIN (4–6 digits)')}><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>
              <Field label={t('Repeat PIN')}><input type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>
            </div>
            <button className="btn primary" onClick={savePin}>{t('Enable app lock')}</button>
          </>
        )}
      </div>

      <div className="card">
        <h3>💾 {t('Backup & export')}</h3>
        <div className="btn-row">
          <button className="btn" onClick={() => doBackup(false)}>💾 {t('Backup (plain file)')}</button>
          <button className="btn" onClick={() => doBackup(true)}>🔐 {t('Backup (encrypted, AES-256)')}</button>
          <label className="btn">♻️ {t('Restore from backup')}<input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) doRestore(f); e.target.value = ''; }} /></label>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => exportXLSX(items)}>📊 {t('Export Excel (.xlsx)')}</button>
          <button className="btn" onClick={() => exportCSV(items)}>📄 {t('Export CSV')}</button>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={async () => {
            if (!storagePersistSupported()) { say(isIOS() ? 'iOS 17+' : '—'); return; }
            const ok = await navigator.storage.persist();
            say(ok ? '✅' : '⚠');
          }}>🛡 {t('Ask browser to keep data permanently')}</button>
        </div>
        <p className="muted">{t('Last backup:')} {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : t('never')}</p>
      </div>

      <div className="card">
        <h3>✨ AI receipt scanning (optional)</h3>
        <div className="banner danger" role="alert">
          ⚠ Off by default. When you enable this, the receipt <b>photo leaves your device</b> and is sent
          only to the provider you choose below (or your own local server). Without this enabled,
          scanning is 100% on-device and nothing is ever uploaded.
        </div>
        <Field label="Enable AI scanning">
          <select value={ai.enabled ? '1' : '0'} onChange={e => setAi({ enabled: e.target.value === '1' })}>
            <option value="0">Off (on-device OCR only)</option>
            <option value="1">On — I understand the photo is sent to my chosen provider</option>
          </select>
        </Field>
        {ai.enabled && (
          <>
            <Field label="AI provider">
              <select value={ai.provider} onChange={e => setAi({ provider: e.target.value as AISettings['provider'] })}>
                {AI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <p className="muted">{AI_PROVIDERS.find(p => p.id === ai.provider)?.hint}</p>
            <div className="field-row">
              <Field label="Model"><input value={ai.model} placeholder={AI_PROVIDERS.find(p => p.id === ai.provider)?.defaultModel} onChange={e => setAi({ model: e.target.value })} /></Field>
              <Field label={ai.provider === 'local' ? 'Server URL' : 'API key (stored only on this device)'}>
                <input type={ai.provider === 'local' ? 'text' : 'password'} value={ai.provider === 'local' ? ai.baseUrl : ai.apiKey}
                  placeholder={ai.provider === 'local' ? 'http://192.168.1.10:11434' : 'sk-…'}
                  onChange={e => ai.provider === 'local' ? setAi({ baseUrl: e.target.value }) : setAi({ apiKey: e.target.value })} />
              </Field>
            </div>
            {ai.provider === 'local' && (
              <>
                <Field label="API key (only if your local server requires one)">
                  <input type="password" value={ai.apiKey} onChange={e => setAi({ apiKey: e.target.value })} />
                </Field>
                <Field label="Local server type">
                  <select value={ai.localMode} onChange={e => setAi({ localMode: e.target.value as AISettings['localMode'] })}>
                    <option value="ollama">Ollama (/api/chat)</option>
                    <option value="openai-compat">OpenAI-compatible, e.g. LM Studio (/v1/chat/completions)</option>
                  </select>
                </Field>
              </>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>🧪 {t('Example data')}</h3>
        <div className="btn-row">
          <button className="btn" onClick={async () => { await loadExampleData(); setExHas(true); say('✅'); }}>{t('Load example data')}</button>
          {exHas && <button className="btn danger" onClick={async () => { await removeExampleData(); setExHas(await hasExampleData()); say('🗑'); }}>{t('Remove example data')}</button>}
        </div>
      </div>

      <div className="card">
        <h3>🔐 {t('Privacy')}</h3>
        <p className="muted">
          Receipt Vault stores everything in your browser's local database on this device only.
          There is no server, no account and no tracking. Receipt scanning (OCR) uses an engine bundled
          inside the app and runs entirely on this device — you can verify this in your browser's
          DevTools → Network tab: while scanning, no request leaves your device.
        </p>
      </div>
    </div>
  );
}
