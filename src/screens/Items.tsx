import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, uid } from '../db';
import type { VaultItem, ItemKind } from '../types';
import { monthlyCost, nextCharge, cancellationDeadline, installmentStatus, warrantiesOf, claimStatus, documentValidUntil, paidUntil } from '../lib/calc';
import { todayISO, formatDate, toISODate, addMonths, parseISODate } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { Badge, Modal, kindLabel } from '../components/ui';
import { go } from '../App';
import { t } from '../lib/i18n';

const KINDS: ItemKind[] = ['purchase', 'installment', 'subscription', 'contract', 'document'];

export default function Items({ detailId }: { detailId?: string }) {
  const items = useLiveQuery(() => db.items.orderBy('updatedAt').reverse().toArray());
  const methods = useLiveQuery(() => db.paymentMethods.toArray());
  const settings = useLiveQuery(() => getSettings());
  const [filter, setFilter] = useState<ItemKind | 'all'>('all');
  const [picker, setPicker] = useState(false);

  const detail = useMemo(() => items?.find(i => i.id === detailId), [items, detailId]);

  if (!items || !methods || !settings) return <p className="muted">{t('Loading…')}</p>;
  if (detailId && detail) return <ItemDetail item={detail} methods={methods} settings={settings} />;
  if (detailId && !detail) return <p className="muted">{t('Item not found.')} <a href="#/items">{t('All items')}</a></p>;

  const shown = items.filter(i => filter === 'all' || i.kind === filter);

  return (
    <div>
      <div className="section-title">
        <h1 style={{ margin: 0 }}>{t('Items')}</h1>
        <button className="btn primary" onClick={() => setPicker(true)}>➕ {t('Add')}</button>
      </div>
      <div className="filters">
        {(['all', ...KINDS] as const).map(k => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{k === 'all' ? t('All') : kindLabel(k)}</button>
        ))}
      </div>
      <div className="list">
        {shown.map(item => (
          <div className="card item-row" key={item.id}>
            <div className="grow">
              <div className="item-title">{kindLabel(item.kind)} {item.title}</div>
              <div className="item-sub">
                {item.category} · {item.kind !== 'document' && item.kind !== 'purchase' && `${formatMoney(monthlyCost(item), settings.currency)}/mo`}
                {item.kind === 'purchase' && `${formatMoney(item.price, item.currency)} ${formatDate(item.purchaseDate)}`}
                {item.kind === 'document' && `${t('Valid until:')} ${formatDate(documentValidUntil(item))}`}
                {item.cancelledAt && <> · <Badge tone="info">{t('Cancelled')} {formatDate(item.cancelledAt)}</Badge></>}
              </div>
            </div>
            <a className="btn" href={`#/item/${item.id}`}>{t('Open')}</a>
          </div>
        ))}
        {shown.length === 0 && <p className="muted">{t('No items yet. Add your first receipt, subscription or contract.')}</p>}
      </div>

      {picker && (
        <Modal title={t('What do you want to record?')} onClose={() => setPicker(false)}>
          <div className="kinds">
            {KINDS.map(k => (
              <button className="kind-btn" key={k} onClick={() => { setPicker(false); go({ name: 'new', kind: k }); }}>
                <span aria-hidden>{kindLabel(k).split(' ')[0]}</span>
                {kindLabel(k).split(' ').slice(1).join(' ')}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ItemDetail({ item, methods, settings }: { item: VaultItem; methods: any[]; settings: any }) {
  const today = todayISO();
  const method = methods.find(m => m.id === item.paymentMethodId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cancel = async () => {
    if (item.cancelledAt) {
      const { cancelledAt, ...rest } = item;
      await db.items.put({ ...rest, updatedAt: today } as VaultItem);
    } else {
      await db.items.put({ ...item, cancelledAt: today, updatedAt: today });
    }
  };

  return (
    <div>
      <p><a href="#/items">← {t('All items')}</a></p>
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          <h2 style={{ margin: 0 }}>{kindLabel(item.kind)} {item.title}</h2>
          <Badge tone={item.cancelledAt ? 'info' : 'ok'}>{item.cancelledAt ? `❌ ${t('Cancelled')} ${formatDate(item.cancelledAt)}` : `✅ ${t('Active')}`}</Badge>
        </div>
        <p className="muted">Category: {item.category} {item.notes && <>· Notes: {item.notes}</>}</p>
        {method && <p>{t('Paid with:')} <b>{method.name} ••{method.last4}</b>{method.type === 'card' && method.expiryMonth ? ` (${t('Valid until:')} ${formatDate(toISODate(endOfMonthSafe(method.expiryMonth)))})` : ''}</p>}

        {item.kind === 'purchase' && (
          <div>
            <p>{t('Price:')} <b>{formatMoney(item.price, item.currency)}</b> {formatDate(item.purchaseDate)}</p>
            {item.serialNumber && <p>{t('Serial:')} <span className="mono">{item.serialNumber}</span></p>}
            {item.orderNumber && <p>{t('Order no.:')} <span className="mono">{item.orderNumber}</span></p>}
            <ul>
              {warrantiesOf(item).map(w => <li key={w.label}>{w.label}: {t('until')} <b>{formatDate(w.end)}</b> {today > w.end ? <Badge tone="overdue">⚠ {t('Expired')}</Badge> : <Badge tone="ok">ℹ {t('Active')}</Badge>}</li>)}
            </ul>
            <p>{t('If something is wrong:')} <b>{claimStatus(item, today)}</b> — <a href={`#/assistant/${item.id}`}>🤖 {t('write a claim/return letter')}</a></p>
          </div>
        )}

        {item.kind === 'installment' && (() => {
          const s = installmentStatus(item, today);
          return (
            <div>
              <p>{t('Rate:')} <b>{formatMoney(item.rateAmount, item.currency)}</b> {item.interval}</p>
              <p>{t('Left:')} <b>{formatMoney(s.remaining, item.currency)}</b> · {t('payments left:')} <b>{s.paymentsLeft}</b> · {t('next:')} {s.nextPayment ? formatDate(s.nextPayment) : '—'} · {t('paid off:')} {s.payoffDate ? formatDate(s.payoffDate) : '—'}</p>
            </div>
          );
        })()}

        {item.kind === 'subscription' && (
          <div>
            <p>{t('Price:')} <b>{formatMoney(item.price, item.currency)}</b> {item.interval} (= {formatMoney(monthlyCost(item), item.currency)}/mo)</p>
            <p>{t('Next charge:')} <b>{nextCharge(item, today) ? formatDate(nextCharge(item, today)!) : '—'}</b>{item.trialEnds && item.trialEnds > today ? ` (${t('free trial until')} ${formatDate(item.trialEnds)})` : ''}</p>
            {item.minTermMonths ? <p>{t('Minimum term:')} {item.minTermMonths}</p> : null}
          </div>
        )}

        {item.kind === 'contract' && (() => {
          const d = cancellationDeadline(item, today);
          return (
            <div>
              <p>{t('Price:')} <b>{formatMoney(item.price, item.currency)}</b> {item.interval} (= {formatMoney(monthlyCost(item), item.currency)}/mo)</p>
              <p>{t('Minimum term:')} {item.minTermMonths} · {t('Renewal period (months)')}: {item.renewalPeriodMonths} · {t('Notice period (months)')}: {item.noticePeriodMonths}</p>
              <p>{t('Cancel by:')} <b>{formatDate(d.deadline)}</b> {t('for term ending')} <b>{formatDate(d.termEnd)}</b> <Badge tone={d.deadline < today ? 'overdue' : d.deadline === today ? 'today' : 'later'}>{d.deadline < today ? '⚠' : d.deadline === today ? '⏰' : 'ℹ'} {formatDate(d.deadline)}</Badge></p>
              <p><a href={`#/assistant/${item.id}`}>🤖 {t('Write cancellation letter')}</a></p>
            </div>
          );
        })()}

        {item.kind === 'document' && (
          <div>
            <p>{t('Valid until:')} <b>{formatDate(documentValidUntil(item))}</b> <Badge tone={documentValidUntil(item) < today ? 'overdue' : 'ok'}>{documentValidUntil(item) < today ? `⚠ ${t('Expired')}` : `ℹ ${t('Valid')}`}</Badge></p>
            <p>{t('Reminder:')} {item.remindDaysBefore} {t('days before')}{item.repeatMonths ? ` · ${t('repeats every')} ${item.repeatMonths}` : ''}</p>
            <button className="btn" onClick={async () => { await db.items.put({ ...item, renewedAt: today, updatedAt: today } as VaultItem); }}>✅ {t('I renewed it')}</button>
          </div>
        )}

        {item.cancelledAt && paidUntil(item) && <p className="muted">{t('Still costs money until')} {formatDate(paidUntil(item)!)} {t('(paid period / term end).')}</p>}

        {item.account && (item.account.customerNumber || item.account.contractNumber || item.account.cancelUrl || item.account.cancelEmail || item.account.cancelPhone) && (
          <div>
            <h3>{t('Cancellation info')}</h3>
            {item.account.customerNumber && <p>{t('Customer number:')} <span className="mono">{item.account.customerNumber}</span></p>}
            {item.account.contractNumber && <p>{t('Contract number:')} <span className="mono">{item.account.contractNumber}</span></p>}
            {item.account.cancelUrl && <p>{t('Cancellation website:')} <a href={item.account.cancelUrl}>{item.account.cancelUrl}</a></p>}
            {item.account.cancelEmail && <p>{t('Email:')} <a href={`mailto:${item.account.cancelEmail}`}>{item.account.cancelEmail}</a></p>}
            {item.account.cancelPhone && <p>{t('Phone:')} {item.account.cancelPhone}</p>}
          </div>
        )}

        {item.priceHistory.length > 0 && (
          <div>
            <h3>{t('Price history')}</h3>
            <ul>{item.priceHistory.map((p, i) => <li key={i}>{formatDate(p.date)}: {formatMoney(p.amount, p.currency)}{p.note ? ` (${p.note})` : ''}</li>)}</ul>
          </div>
        )}

        {item.attachments.length > 0 && (
          <div>
            <h3>{t('Receipts & documents')}</h3>
            <div className="att-row">
              {item.attachments.map(a => (
                <a key={a.id} href={URL.createObjectURL(a.blob)} download={a.name} title={a.name}>
                  {a.thumb ? <img className="att-thumb" src={URL.createObjectURL(a.thumb)} alt={a.name} /> : <span className="btn">📄 {a.name}</span>}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="btn-row">
          <button className="btn" onClick={() => go({ name: 'edit', id: item.id })}>✏️ {t('Edit')}</button>
          <button className="btn" onClick={cancel}>{item.cancelledAt ? `↩️ ${t('Undo cancellation')}` : `❌ ${t('Mark cancelled')}`}</button>
          {confirmDelete
            ? <button className="btn danger" onClick={async () => { await db.items.delete(item.id); go({ name: 'items' }); }}>{t('Really delete?')}</button>
            : <button className="btn danger" onClick={() => setConfirmDelete(true)}>🗑 {t('Delete')}</button>}
        </div>
      </div>
    </div>
  );
}

function endOfMonthSafe(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0);
}
