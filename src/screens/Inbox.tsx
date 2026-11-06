import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, uid } from '../db';
import type { InboxFile, PurchaseItem, ParsedReceipt } from '../types';
import { ocrImage } from '../lib/ocr';
import { parseReceiptText } from '../lib/receipt';
import { AI_PROVIDERS, blobToDataURL, callVisionAI } from '../lib/ai';
import { shrinkImage, makeThumb } from '../lib/images';
import { todayISO } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { t } from '../lib/i18n';
import { go } from '../App';

export default function Inbox() {
  const inbox = useLiveQuery(() => db.inbox.orderBy('receivedAt').reverse().toArray());
  const settings = useLiveQuery(() => getSettings());
  const [scanning, setScanning] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  if (!inbox || !settings) return <p className="muted">{t('Loading…')}</p>;

  const scan = async (f: InboxFile) => {
    setScanning(f.id);
    setProgress(t('Scanning on-device…'));
    try {
      const text = await ocrImage(f.blob, p => setProgress(`${p.status} ${Math.round(p.progress * 100)}%`));
      const parsed = parseReceiptText(text);
      await db.inbox.update(f.id, { parsed });
      setScanning(null);
    } catch (e) {
      setScanning(null);
      alert('Scanning failed: ' + (e as Error).message);
    }
  };

  const scanWithAI = async (f: InboxFile) => {
    const ai = settings.ai;
    if (!ai?.enabled) return;
    const providerLabel = AI_PROVIDERS.find(p => p.id === ai.provider)?.label ?? ai.provider;
    const target = ai.provider === 'local' ? (ai.baseUrl || 'local server') : providerLabel;
    if (!confirm(`⚠ This sends the photo to ${target}. Only do this if you trust that provider. Continue?`)) return;
    setScanning(f.id);
    setProgress(`Sending to ${target}…`);
    try {
      const shrunk = await shrinkImage(f.blob, 1600, 0.8);
      const dataUrl = await blobToDataURL(shrunk);
      const [meta, b64] = dataUrl.split(',');
      const mime = meta.match(/data:(.*?);/)?.[1] ?? 'image/jpeg';
      const parsed = await callVisionAI(ai, mime, b64);
      await db.inbox.update(f.id, { parsed });
      setScanning(null);
    } catch (e) {
      setScanning(null);
      alert('AI scan failed: ' + (e as Error).message);
    }
  };

  const createPurchase = async (f: InboxFile) => {
    const parsed: ParsedReceipt = f.parsed ?? {};
    const stored = f.type.startsWith('image/') ? await shrinkImage(f.blob) : f.blob;
    const thumb = f.type.startsWith('image/') ? await makeThumb(stored) : undefined;
    const item: PurchaseItem = {
      id: uid(), kind: 'purchase', title: parsed.store ?? f.name.replace(/\.[^.]+$/, ''),
      category: 'Other', notes: '',
      price: parsed.total ?? 0, currency: parsed.currency ?? settings.currency,
      purchaseDate: parsed.date ?? todayISO(), returnWindowDays: 14, legalGuaranteeMonths: 24,
      attachments: [{ id: uid(), name: f.name, type: stored.type || f.type, size: stored.size, blob: stored, thumb }],
      priceHistory: parsed.total != null ? [{ date: parsed.date ?? todayISO(), amount: parsed.total, currency: parsed.currency ?? settings.currency }] : [],
      createdAt: todayISO(), updatedAt: todayISO()
    };
    await db.items.put(item);
    await db.inbox.delete(f.id);
    go({ name: 'item', id: item.id });
  };

  return (
    <div>
      <h1>📥 {t('Inbox')}</h1>
      <p className="muted">{t('Receipt scanning runs 100% on this device — the OCR engine is bundled with the app and no outside server is contacted.')}</p>
      <div className="btn-row">
        <label className="btn">📷 {t('Snap / choose receipt')}
          <input type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={async e => {
            const files = e.target.files;
            if (!files) return;
            for (const file of Array.from(files)) {
              await db.inbox.add({ id: uid(), name: file.name || `photo-${Date.now()}.jpg`, type: file.type || 'image/jpeg', size: file.size, blob: file, receivedAt: new Date().toISOString() });
            }
            e.target.value = '';
          }} />
        </label>
      </div>

      <div className="list" style={{ marginTop: 12 }}>
        {inbox.map(f => (
          <div className="card" key={f.id}>
            <div className="item-row">
              <div className="grow">
                <div className="item-title">{f.type.startsWith('image/') ? '🖼' : '📄'} {f.name}</div>
                <div className="item-sub">{(f.size / 1024).toFixed(0)} KB · {new Date(f.receivedAt).toLocaleString()}</div>
              </div>
            </div>
            {scanning === f.id && <p className="muted">🔍 {t('Scanning on-device…')} {progress}</p>}
            {f.parsed && (
              <div className="banner info">
                🔍 {t('Recognised:')} {f.parsed.store && <>{t('store')} <b>{f.parsed.store}</b> · </>}
                {f.parsed.date && <>{t('date')} <b>{f.parsed.date}</b> · </>}
                {f.parsed.total != null && <>{t('total')} <b>{formatMoney(f.parsed.total, f.parsed.currency ?? settings.currency)}</b></>}
                {!f.parsed.total && t('no total found')} — {t('please check before saving.')}
              </div>
            )}
            <div className="btn-row">
              {f.type.startsWith('image/') && !f.parsed && (
                <button className="btn primary" disabled={scanning !== null} onClick={() => scan(f)}>🔍 {t('Scan receipt (on-device)')}</button>
              )}
              {f.type.startsWith('image/') && !f.parsed && settings.ai?.enabled && (
                <button className="btn" disabled={scanning !== null} onClick={() => scanWithAI(f)} title="Photo is sent to the provider you configured in Settings">
                  ✨ Scan with AI ({AI_PROVIDERS.find(p => p.id === settings.ai!.provider)?.label}) — sends photo ⚠
                </button>
              )}
              <button className="btn primary" onClick={() => createPurchase(f)}>➕ {t('Create purchase from this')}</button>
              <button className="btn danger" onClick={() => db.inbox.delete(f.id)}>🗑 {t('Delete')}</button>
            </div>
          </div>
        ))}
        {inbox.length === 0 && <p className="muted">{t('Inbox is empty. Share a photo or PDF from another app, or snap one here.')}</p>}
      </div>
    </div>
  );
}
