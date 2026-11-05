import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, uid } from '../db';
import type { InboxFile, PurchaseItem, ParsedReceipt } from '../types';
import { ocrImage } from '../lib/ocr';
import { parseReceiptText } from '../lib/receipt';
import { shrinkImage, makeThumb } from '../lib/images';
import { todayISO } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { go } from '../App';

export default function Inbox() {
  const inbox = useLiveQuery(() => db.inbox.orderBy('receivedAt').reverse().toArray());
  const settings = useLiveQuery(() => getSettings());
  const [scanning, setScanning] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  if (!inbox || !settings) return <p className="muted">Loading…</p>;

  const scan = async (f: InboxFile) => {
    setScanning(f.id);
    setProgress('Loading on-device OCR engine…');
    try {
      const text = await ocrImage(f.blob, p => setProgress(`${p.status} ${Math.round(p.progress * 100)}%`));
      const parsed = parseReceiptText(text);
      await db.inbox.update(f.id, { parsed });
      await db.inbox.update(f.id, { parsed });
      setScanning(null);
    } catch (e) {
      setScanning(null);
      alert('Scanning failed: ' + (e as Error).message + '\nThe OCR engine runs fully on this device.');
    }
  };

  const createPurchase = async (f: InboxFile) => {
    const parsed: ParsedReceipt = f.parsed ?? {};
    const stored = f.type.startsWith('image/') ? await shrinkImage(f.blob) : f.blob;
    const thumb = f.type.startsWith('image/') ? await makeThumb(stored) : undefined;
    const item: PurchaseItem = {
      id: uid(), kind: 'purchase', title: parsed.store ?? f.name.replace(/\.[^.]+$/, ''),
      category: 'Other', notes: 'Scanned from inbox. Please check the values.',
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
      <h1>📥 Inbox</h1>
      <p className="muted">Files shared from other apps or snapped quickly land here. Receipt scanning runs <b>100% on this device</b> — the OCR engine is bundled with the app and no outside server is contacted.</p>
      <div className="btn-row">
        <label className="btn">📷 Snap / choose receipt
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
                <div className="item-sub">{(f.size / 1024).toFixed(0)} KB · received {new Date(f.receivedAt).toLocaleString()}</div>
              </div>
            </div>
            {scanning === f.id && <p className="muted">🔍 Scanning on-device… {progress}</p>}
            {f.parsed && (
              <div className="banner info">
                🔍 Recognised: {f.parsed.store && <>store <b>{f.parsed.store}</b> · </>}
                {f.parsed.date && <>date <b>{f.parsed.date}</b> · </>}
                {f.parsed.total != null && <>total <b>{formatMoney(f.parsed.total, f.parsed.currency ?? settings.currency)}</b></>}
                {!f.parsed.total && 'no total found'} — please check before saving.
              </div>
            )}
            <div className="btn-row">
              {f.type.startsWith('image/') && !f.parsed && (
                <button className="btn primary" disabled={scanning !== null} onClick={() => scan(f)}>🔍 Scan receipt (on-device)</button>
              )}
              <button className="btn primary" onClick={() => createPurchase(f)}>➕ Create purchase from this</button>
              <button className="btn danger" onClick={() => db.inbox.delete(f.id)}>🗑 Delete</button>
            </div>
          </div>
        ))}
        {inbox.length === 0 && <p className="muted">Inbox is empty. Share a photo or PDF from another app to Receipt Vault, or snap one here.</p>}
      </div>
    </div>
  );
}
