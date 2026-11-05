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
import { Field } from '../components/ui';

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

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

  if (!settings || !items || !methods) return <p className="muted">Loading…</p>;

  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };
  const update = (patch: Partial<typeof settings>) => db.settings.put({ ...settings, ...patch });
  if (exHas === null) hasExampleData().then(setExHas);

  const savePin = async () => {
    if (pin.length < 4 || pin.length > 6 || pin !== pin2) { say('PIN must be 4–6 digits and match.'); return; }
    const salt = uid();
    await update({ lockEnabled: true, pinSalt: salt, pinHash: await sha256Hex(salt + ':' + pin) });
    setPin(''); setPin2('');
    say('🔒 App lock enabled.');
  };

  const addMethod = async () => {
    if (!pmName.trim() || !/^\d{4}$/.test(pmLast4)) { say('Name required and exactly the LAST 4 digits only (never a full number).'); return; }
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
      <h1>⚙️ Settings</h1>
      {msg && <div className="banner info" role="status">{msg}</div>}

      <div className="card">
        <h3>Basics</h3>
        <div className="field-row">
          <Field label="Monthly income (€)"><input type="number" min="0" step="0.01" value={settings.monthlyIncome ?? ''} onChange={e => update({ monthlyIncome: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
          <Field label="Currency"><input value={settings.currency} maxLength={3} onChange={e => update({ currency: e.target.value.toUpperCase().slice(0, 3) })} /></Field>
        </div>
        <Field label="Theme">
          <select value={settings.theme} onChange={e => update({ theme: e.target.value as any })}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </Field>
      </div>

      <div className="card">
        <h3>Spending limits</h3>
        <p className="muted">Warn at 70 / 80 / 90 / 100% — on the overview and before saving an item. A fixed amount or a % of your income.</p>
        {settings.limits.map(l => (
          <div className="event-row" key={l.id} style={{ marginBottom: 6 }}>
            <span className="event-title">{l.label} — {l.scope}{l.category ? ` (${l.category})` : ''} — {l.mode === 'fixed' ? `${l.amount} ${settings.currency}` : `${l.percent}% of income`}</span>
            <button className="btn danger icon" onClick={() => update({ limits: settings.limits.filter(x => x.id !== l.id) })}>🗑</button>
          </div>
        ))}
        <div className="field-row">
          <Field label="Label"><input value={limitLabel} onChange={e => setLimitLabel(e.target.value)} placeholder="e.g. All spending" /></Field>
          <Field label="Applies to">
            <select value={limitScope} onChange={e => setLimitScope(e.target.value as any)}>
              <option value="all">All payments</option><option value="subscriptions">Subscriptions</option><option value="contracts">Contracts</option><option value="installments">Installments</option><option value="category">One category</option>
            </select>
          </Field>
        </div>
        {limitScope === 'category' && (
          <Field label="Category"><select value={limitCategory} onChange={e => setLimitCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        )}
        <div className="field-row">
          <Field label="Type">
            <select value={limitMode} onChange={e => setLimitMode(e.target.value as any)}>
              <option value="fixed">Fixed amount</option><option value="percentOfIncome">% of income</option>
            </select>
          </Field>
          {limitMode === 'fixed'
            ? <Field label="Amount"><input type="number" min="0" step="0.01" value={limitAmount} onChange={e => setLimitAmount(e.target.value)} /></Field>
            : <Field label="Percent of income"><input type="number" min="0" max="100" value={limitPercent} onChange={e => setLimitPercent(e.target.value)} /></Field>}
        </div>
        <button className="btn" onClick={addLimit}>➕ Add limit</button>
      </div>

      <div className="card">
        <h3>Payment methods</h3>
        <p className="muted">Only a name and the last 4 digits are stored — never a full number.</p>
        {methods.map(m => (
          <div className="event-row" key={m.id} style={{ marginBottom: 6 }}>
            <span className="event-title">{m.name} ••{m.last4} ({m.type}){m.type === 'card' && m.expiryMonth ? ` — valid until end of ${m.expiryMonth}` : ''}</span>
            <button className="btn danger icon" onClick={() => db.paymentMethods.delete(m.id)}>🗑</button>
          </div>
        ))}
        <div className="field-row">
          <Field label="Name"><input value={pmName} onChange={e => setPmName(e.target.value)} placeholder="e.g. Visa card" /></Field>
          <Field label="Last 4 digits only"><input inputMode="numeric" maxLength={4} value={pmLast4} onChange={e => setPmLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" /></Field>
        </div>
        <div className="field-row">
          <Field label="Type">
            <select value={pmType} onChange={e => setPmType(e.target.value as any)}>
              <option value="card">Card</option><option value="bank">Bank account (direct debit)</option><option value="cash">Cash</option><option value="other">Other</option>
            </select>
          </Field>
          {pmType === 'card' && <Field label="Card expiry month"><input type="month" value={pmExpiry} onChange={e => setPmExpiry(e.target.value)} /></Field>}
        </div>
        <button className="btn" onClick={addMethod}>➕ Add payment method</button>
      </div>

      <div className="card">
        <h3>🔒 App lock</h3>
        <p className="muted">PIN (and optionally fingerprint/Face ID). This is a privacy screen, not encryption.</p>
        {settings.lockEnabled ? (
          <>
            <p>Lock is <b>enabled</b>.</p>
            <div className="btn-row">
              <button className="btn danger" onClick={async () => { const pw = prompt('Enter current PIN to disable the lock:'); if (pw && settings.pinSalt && await sha256Hex(settings.pinSalt + ':' + pw) === settings.pinHash) { await update({ lockEnabled: false, pinHash: undefined, pinSalt: undefined }); say('Lock disabled.'); } else if (pw) say('Wrong PIN.'); }}>Disable lock</button>
              <button className="btn" onClick={async () => {
                if (!(await webauthnAvailable())) { say('No platform authenticator (fingerprint/Face ID) available on this device.'); return; }
                try { await update({ webauthnCredentialId: await enrollWebAuthn(), webauthnEnabled: true }); say('👆 Fingerprint / Face ID enrolled.'); }
                catch (e) { say('Enrolment cancelled/failed: ' + (e as Error).message); }
              }}>{settings.webauthnEnabled ? 'Re-enroll fingerprint / Face ID' : '👆 Enable fingerprint / Face ID'}</button>
              {settings.webauthnEnabled && <button className="btn" onClick={() => update({ webauthnEnabled: false, webauthnCredentialId: undefined })}>Disable biometric</button>}
            </div>
          </>
        ) : (
          <>
            <div className="field-row">
              <Field label="Choose PIN (4–6 digits)"><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>
              <Field label="Repeat PIN"><input type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>
            </div>
            <button className="btn primary" onClick={savePin}>Enable app lock</button>
          </>
        )}
      </div>

      <div className="card">
        <h3>💾 Backup & export</h3>
        <p className="muted">Backups stay on your device — you decide where to put the file. Encrypted backups use AES-256 with your password.</p>
        <div className="btn-row">
          <button className="btn" onClick={() => doBackup(false)}>💾 Backup (plain file)</button>
          <button className="btn" onClick={() => doBackup(true)}>🔐 Backup (encrypted, AES-256)</button>
          <label className="btn">♻️ Restore from backup<input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) doRestore(f); e.target.value = ''; }} /></label>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => exportXLSX(items)}>📊 Export Excel (.xlsx)</button>
          <button className="btn" onClick={() => exportCSV(items)}>📄 Export CSV</button>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={async () => { const ok = await navigator.storage.persist?.(); say(ok ? '✅ Browser asked to keep data permanently.' : 'Browser refused — data may be cleared under storage pressure.'); }}>🛡 Ask browser to keep data permanently</button>
        </div>
        <p className="muted">Last backup: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : 'never'}</p>
      </div>

      <div className="card">
        <h3>🧪 Example data</h3>
        <div className="btn-row">
          <button className="btn" onClick={async () => { await loadExampleData(); setExHas(true); say('Example data loaded — you can remove it again here.'); }}>Load example data</button>
          {exHas && <button className="btn danger" onClick={async () => { const n = await removeExampleData(); setExHas(await hasExampleData()); say(`Removed ${n} example items.`); }}>Remove example data</button>}
        </div>
      </div>

      <div className="card">
        <h3>🔐 Privacy</h3>
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
