import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, uid } from '../db';
import { CATEGORIES, type ItemKind, type VaultItem, type Attachment, type AccountInfo } from '../types';
import { todayISO } from '../lib/dates';
import { checkItemAgainstLimits } from '../lib/limits';
import { shrinkImage, makeThumb } from '../lib/images';
import { Field } from '../components/ui';
import { go } from '../App';
import { t } from '../lib/i18n';

const INTERVALS = [
  { v: 'week', labelKey: 'Weekly' },
  { v: 'month', labelKey: 'Monthly' },
  { v: 'quarter', labelKey: 'Quarterly' },
  { v: 'year', labelKey: 'Yearly' }
];

export default function ItemForm({ kind, editId }: { kind?: ItemKind; editId?: string }) {
  const existing = useLiveQuery(async () => (editId ? await db.items.get(editId) : undefined), [editId]);
  const items = useLiveQuery(() => db.items.toArray());
  const methods = useLiveQuery(() => db.paymentMethods.toArray());
  const settings = useLiveQuery(() => getSettings());
  const [form, setForm] = useState<any>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existing === undefined) return;
    if (existing) {
      setForm({ ...existing });
      setAttachments(existing.attachments ?? []);
      return;
    }
    if (kind && !form) {
      const prefillRaw = sessionStorage.getItem('rv-prefill');
      const prefill = prefillRaw ? JSON.parse(prefillRaw) : {};
      sessionStorage.removeItem('rv-prefill');
      const base: any = {
        id: uid(), kind, title: prefill.store ?? '', category: 'Other', notes: '',
        account: {}, paymentMethodId: undefined, attachments: [], priceHistory: [],
        createdAt: todayISO(), updatedAt: todayISO()
      };
      if (kind === 'purchase') Object.assign(base, {
        price: prefill.total ?? '', currency: prefill.currency ?? settings?.currency ?? 'EUR',
        purchaseDate: prefill.date ?? todayISO(), returnWindowDays: 14, legalGuaranteeMonths: 24,
        warrantyMonths: '', extendedWarrantyMonths: '', serialNumber: '', orderNumber: ''
      });
      if (kind === 'installment') Object.assign(base, { rateAmount: '', currency: 'EUR', interval: 'month', totalAmount: '', firstPaymentDate: todayISO(), remainingAmount: '', nextPaymentDate: '' });
      if (kind === 'subscription') Object.assign(base, { price: prefill.total ?? '', currency: prefill.currency ?? 'EUR', interval: 'month', firstChargeDate: prefill.date ?? todayISO(), trialEnds: '', minTermMonths: '' });
      if (kind === 'contract') Object.assign(base, { price: '', currency: 'EUR', interval: 'month', startDate: todayISO(), minTermMonths: 24, renewalPeriodMonths: 1, noticePeriodMonths: 1, firstChargeDate: '' });
      if (kind === 'document') Object.assign(base, { expiryDate: '', expiryMonthOnly: false, remindDaysBefore: 30, repeatMonths: '' });
      setForm(base);
    }
  }, [existing, kind, settings]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setAccount = (k: keyof AccountInfo, v: string) => setForm((f: any) => ({ ...f, account: { ...(f.account ?? {}), [k]: v } }));

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const stored = isImage ? await shrinkImage(file) : file;
      const thumb = isImage ? await makeThumb(stored) : undefined;
      setAttachments(a => [...a, { id: uid(), name: file.name || 'receipt', type: stored.type || file.type, size: stored.size, blob: stored, thumb }]);
    }
  };

  const limitWarnings = useMemo(() => {
    if (!form || !items || !settings) return [];
    const monthISO = form.purchaseDate ?? form.firstChargeDate ?? form.startDate ?? form.nextPaymentDate ?? todayISO();
    return checkItemAgainstLimits(form as VaultItem, items, settings.limits, settings.monthlyIncome, monthISO)
      .filter(l => l.level !== 'ok')
      .map(l => `${l.message} — ${l.limit.label}: ${l.spent} of ${l.budget}`);
  }, [form, items, settings]);

  const save = async () => {
    if (!form || !items || !settings) return;
    if (!form.title || !String(form.title).trim()) { setError(t('Please give it a title.')); return; }
    if (['purchase', 'subscription', 'contract'].includes(form.kind) && (form.price === '' || isNaN(Number(form.price)))) { setError(t('Please enter a price.')); return; }
    if (form.kind === 'installment' && (form.rateAmount === '' || isNaN(Number(form.rateAmount)))) { setError(t('Please enter the rate amount.')); return; }

    const numeric = (v: any) => (v === '' || v == null ? undefined : Number(v));
    const old = editId ? items.find(i => i.id === editId) : undefined;
    const priceHistory = [...(form.priceHistory ?? [])];
    if (old && ['purchase', 'subscription', 'contract'].includes(form.kind)) {
      const oldPrice = (old as any).price;
      const newPrice = Number(form.price);
      if (oldPrice !== newPrice) priceHistory.push({ date: todayISO(), amount: newPrice, currency: form.currency ?? 'EUR', note: 'price change' });
    }
    if (old == null && ['purchase', 'subscription', 'contract'].includes(form.kind)) {
      priceHistory.push({ date: form.purchaseDate ?? form.firstChargeDate ?? form.startDate ?? todayISO(), amount: Number(form.price), currency: form.currency ?? 'EUR' });
    }

    const item: any = {
      ...form,
      title: String(form.title).trim(),
      price: numeric(form.price), rateAmount: numeric(form.rateAmount),
      totalAmount: numeric(form.totalAmount), remainingAmount: numeric(form.remainingAmount),
      warrantyMonths: numeric(form.warrantyMonths), extendedWarrantyMonths: numeric(form.extendedWarrantyMonths),
      minTermMonths: numeric(form.minTermMonths), renewalPeriodMonths: numeric(form.renewalPeriodMonths) ?? 1,
      noticePeriodMonths: numeric(form.noticePeriodMonths) ?? 1, remindDaysBefore: numeric(form.remindDaysBefore) ?? 30,
      repeatMonths: numeric(form.repeatMonths), returnWindowDays: numeric(form.returnWindowDays) ?? 14,
      legalGuaranteeMonths: numeric(form.legalGuaranteeMonths) ?? 24,
      attachments, priceHistory, updatedAt: todayISO()
    };
    await db.items.put(item as VaultItem);
    go({ name: 'item', id: item.id });
  };

  if (!form || !methods || !settings) return <p className="muted">{t('Loading…')}</p>;
  const currency = form.currency ?? settings.currency;

  return (
    <div>
      <h1>{t(editId ? 'Edit' : 'New')} {form.kind}</h1>
      {error && <div className="banner danger" role="alert">{error}</div>}
      {warnings.length > 0 && (
        <div className="banner warn" role="alert">
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          <div className="muted">{t('You can still save — the warning is only shown.')}</div>
        </div>
      )}

      <Field label={t('Title')}>
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Amazon Prime" />
      </Field>

      <div className="field-row">
        <Field label={t('Category')}>
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={t('Paid with')}>
          <select value={form.paymentMethodId ?? ''} onChange={e => set('paymentMethodId', e.target.value || undefined)}>
            <option value="">{t('— none —')}</option>
            {methods.map(m => <option key={m.id} value={m.id}>{m.name} ••{m.last4}</option>)}
          </select>
        </Field>
      </div>

      {form.kind === 'purchase' && (
        <>
          <div className="field-row">
            <Field label={t('Price')}><input type="number" step="0.01" min="0" value={form.price} onChange={e => set('price', e.target.value)} /></Field>
            <Field label={t('Currency')}><input value={currency} onChange={e => set('currency', e.target.value.toUpperCase().slice(0, 3))} /></Field>
          </div>
          <div className="field-row">
            <Field label={t('Purchase date')}><input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} /></Field>
            <Field label={t('Return window (days)')}><input type="number" min="0" value={form.returnWindowDays} onChange={e => set('returnWindowDays', e.target.value)} /></Field>
          </div>
          <div className="field-row">
            <Field label={t('Legal guarantee (months)')}><input type="number" min="0" value={form.legalGuaranteeMonths} onChange={e => set('legalGuaranteeMonths', e.target.value)} /></Field>
            <Field label={t('Manufacturer warranty (months)')}><input type="number" min="0" value={form.warrantyMonths} onChange={e => set('warrantyMonths', e.target.value)} /></Field>
          </div>
          <div className="field-row">
            <Field label={t('Extended warranty (months)')}><input type="number" min="0" value={form.extendedWarrantyMonths} onChange={e => set('extendedWarrantyMonths', e.target.value)} /></Field>
            <Field label={t('Serial number')}><input value={form.serialNumber ?? ''} onChange={e => set('serialNumber', e.target.value)} /></Field>
          </div>
          <Field label={t('Order number')}><input value={form.orderNumber ?? ''} onChange={e => set('orderNumber', e.target.value)} /></Field>
        </>
      )}

      {form.kind === 'installment' && (
        <>
          <div className="field-row">
            <Field label={t('Rate amount')}><input type="number" step="0.01" min="0" value={form.rateAmount} onChange={e => set('rateAmount', e.target.value)} /></Field>
            <Field label={t('Currency')}><input value={currency} onChange={e => set('currency', e.target.value.toUpperCase().slice(0, 3))} /></Field>
          </div>
          <Field label={t('Interval')}>
            <select value={form.interval} onChange={e => set('interval', e.target.value)}>
              {INTERVALS.map(i => <option key={i.v} value={i.v}>{t(i.labelKey)}</option>)}
            </select>
          </Field>
          <div className="field-row">
            <Field label={t('Total amount')}><input type="number" step="0.01" min="0" value={form.totalAmount} onChange={e => set('totalAmount', e.target.value)} /></Field>
            <Field label={t('First payment date')}><input type="date" value={form.firstPaymentDate} onChange={e => set('firstPaymentDate', e.target.value)} /></Field>
          </div>
          <div className="field-row">
            <Field label={t("What's left (amount)")}><input type="number" step="0.01" min="0" value={form.remainingAmount} onChange={e => set('remainingAmount', e.target.value)} /></Field>
            <Field label={t('Next payment date')}><input type="date" value={form.nextPaymentDate} onChange={e => set('nextPaymentDate', e.target.value)} /></Field>
          </div>
        </>
      )}

      {form.kind === 'subscription' && (
        <>
          <div className="field-row">
            <Field label={t('Price')}><input type="number" step="0.01" min="0" value={form.price} onChange={e => set('price', e.target.value)} /></Field>
            <Field label={t('Currency')}><input value={currency} onChange={e => set('currency', e.target.value.toUpperCase().slice(0, 3))} /></Field>
          </div>
          <div className="field-row">
            <Field label={t('Interval')}>
              <select value={form.interval} onChange={e => set('interval', e.target.value)}>
                {INTERVALS.map(i => <option key={i.v} value={i.v}>{t(i.labelKey)}</option>)}
              </select>
            </Field>
            <Field label={t('First payment date')}><input type="date" value={form.firstChargeDate} onChange={e => set('firstChargeDate', e.target.value)} /></Field>
          </div>
          <div className="field-row">
            <Field label={t('Free trial ends (optional)')}><input type="date" value={form.trialEnds ?? ''} onChange={e => set('trialEnds', e.target.value)} /></Field>
            <Field label={t('Minimum term (months, optional)')}><input type="number" min="0" value={form.minTermMonths ?? ''} onChange={e => set('minTermMonths', e.target.value)} /></Field>
          </div>
        </>
      )}

      {form.kind === 'contract' && (
        <>
          <div className="field-row">
            <Field label={t('Price')}><input type="number" step="0.01" min="0" value={form.price} onChange={e => set('price', e.target.value)} /></Field>
            <Field label={t('Currency')}><input value={currency} onChange={e => set('currency', e.target.value.toUpperCase().slice(0, 3))} /></Field>
          </div>
          <div className="field-row">
            <Field label={t('Interval')}>
              <select value={form.interval} onChange={e => set('interval', e.target.value)}>
                {INTERVALS.map(i => <option key={i.v} value={i.v}>{t(i.labelKey)}</option>)}
              </select>
            </Field>
            <Field label={t('Start date')}><input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /></Field>
          </div>
          <div className="field-row">
            <Field label={t('Minimum term (months)')}><input type="number" min="1" value={form.minTermMonths} onChange={e => set('minTermMonths', e.target.value)} /></Field>
            <Field label={t('Renewal period (months)')}><input type="number" min="1" value={form.renewalPeriodMonths} onChange={e => set('renewalPeriodMonths', e.target.value)} /></Field>
          </div>
          <div className="field-row">
            <Field label={t('Notice period (months)')}><input type="number" min="0" value={form.noticePeriodMonths} onChange={e => set('noticePeriodMonths', e.target.value)} /></Field>
            <Field label={t('First charge date (optional)')}><input type="date" value={form.firstChargeDate ?? ''} onChange={e => set('firstChargeDate', e.target.value)} /></Field>
          </div>
        </>
      )}

      {form.kind === 'document' && (
        <>
          <div className="field-row">
            <Field label={t('Expiry date')}><input type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} /></Field>
            <Field label={t('Remind me X days before')}><input type="number" min="0" value={form.remindDaysBefore} onChange={e => set('remindDaysBefore', e.target.value)} /></Field>
          </div>
          <div className="field-row">
            <Field label={t('Month only (valid until end of month)')}>
              <select value={form.expiryMonthOnly ? '1' : '0'} onChange={e => {
                const monthOnly = e.target.value === '1';
                set('expiryMonthOnly', monthOnly);
                if (monthOnly && /^\d{4}-\d{2}-\d{2}$/.test(form.expiryDate)) set('expiryDate', form.expiryDate.slice(0, 7));
                if (!monthOnly && /^\d{4}-\d{2}$/.test(form.expiryDate)) set('expiryDate', form.expiryDate + '-01');
              }}>
                <option value="0">{t('Expiry date')}</option>
                <option value="1">{t('Month only (valid until end of month)')}</option>
              </select>
            </Field>
            <Field label={t('Repeats every N months (optional)')}><input type="number" min="0" value={form.repeatMonths ?? ''} onChange={e => set('repeatMonths', e.target.value)} /></Field>
          </div>
        </>
      )}

      <h3>{t('Cancellation info (optional)')}</h3>
      <div className="field-row">
        <Field label={t('Customer number')}><input value={form.account?.customerNumber ?? ''} onChange={e => setAccount('customerNumber', e.target.value)} /></Field>
        <Field label={t('Contract number')}><input value={form.account?.contractNumber ?? ''} onChange={e => setAccount('contractNumber', e.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label={t('Cancellation website')}><input type="url" value={form.account?.cancelUrl ?? ''} onChange={e => setAccount('cancelUrl', e.target.value)} /></Field>
        <Field label={t('Cancellation email')}><input type="email" value={form.account?.cancelEmail ?? ''} onChange={e => setAccount('cancelEmail', e.target.value)} /></Field>
      </div>
      <Field label={t('Cancellation phone')}><input value={form.account?.cancelPhone ?? ''} onChange={e => setAccount('cancelPhone', e.target.value)} /></Field>

      <Field label={t('Notes')}><textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} /></Field>

      <Field label={t('Receipt photos / PDFs (large photos are shrunk automatically, on-device)')}>
        <input type="file" accept="image/*,application/pdf" multiple onChange={e => addFiles(e.target.files)} />
      </Field>
      {attachments.length > 0 && (
        <div className="att-row">
          {attachments.map(a => (
            <div key={a.id} style={{ position: 'relative' }}>
              {a.thumb ? <img className="att-thumb" src={URL.createObjectURL(a.thumb)} alt={a.name} /> : <span className="btn">📄 {a.name}</span>}
              <button className="btn icon" style={{ position: 'absolute', top: -6, right: -6 }} onClick={() => setAttachments(x => x.filter(y => y.id !== a.id))} aria-label={`Remove ${a.name}`}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="btn-row">
        <button className="btn primary" onClick={save}>💾 {t('Save')}</button>
        <button className="btn" onClick={() => go(editId ? { name: 'item', id: editId } : { name: 'items' })}>{t('Cancel')}</button>
      </div>
    </div>
  );
}
