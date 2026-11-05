import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, uid } from '../db';
import type { VaultItem, ItemKind } from '../types';
import { monthlyCost, nextCharge, cancellationDeadline, installmentStatus, warrantiesOf, claimStatus, documentValidUntil, paidUntil } from '../lib/calc';
import { todayISO, formatDate, toISODate, addMonths, parseISODate } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { Badge, Modal, KIND_LABEL } from '../components/ui';
import { go } from '../App';

const KINDS: ItemKind[] = ['purchase', 'installment', 'subscription', 'contract', 'document'];

export default function Items({ detailId }: { detailId?: string }) {
  const items = useLiveQuery(() => db.items.orderBy('updatedAt').reverse().toArray());
  const methods = useLiveQuery(() => db.paymentMethods.toArray());
  const settings = useLiveQuery(() => getSettings());
  const [filter, setFilter] = useState<ItemKind | 'all'>('all');
  const [picker, setPicker] = useState(false);

  const detail = useMemo(() => items?.find(i => i.id === detailId), [items, detailId]);

  if (!items || !methods || !settings) return <p className="muted">Loading…</p>;
  if (detailId && detail) return <ItemDetail item={detail} methods={methods} settings={settings} />;
  if (detailId && !detail) return <p className="muted">Item not found. <a href="#/items">Back to items</a></p>;

  const shown = items.filter(i => filter === 'all' || i.kind === filter);

  return (
    <div>
      <div className="section-title">
        <h1 style={{ margin: 0 }}>Items</h1>
        <button className="btn primary" onClick={() => setPicker(true)}>➕ Add</button>
      </div>
      <div className="filters">
        {(['all', ...KINDS] as const).map(k => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : KIND_LABEL[k]}</button>
        ))}
      </div>
      <div className="list">
        {shown.map(item => (
          <div className="card item-row" key={item.id}>
            <div className="grow">
              <div className="item-title">{KIND_LABEL[item.kind]} {item.title}</div>
              <div className="item-sub">
                {item.category} · {item.kind !== 'document' && item.kind !== 'purchase' && `${formatMoney(monthlyCost(item), settings.currency)}/mo`}
                {item.kind === 'purchase' && `${formatMoney(item.price, item.currency)} on ${formatDate(item.purchaseDate)}`}
                {item.kind === 'document' && `valid until ${formatDate(documentValidUntil(item))}`}
                {item.cancelledAt && <> · <Badge tone="info">cancelled {formatDate(item.cancelledAt)}</Badge></>}
              </div>
            </div>
            <a className="btn" href={`#/item/${item.id}`}>Open</a>
          </div>
        ))}
        {shown.length === 0 && <p className="muted">No items yet. Add your first receipt, subscription or contract.</p>}
      </div>

      {picker && (
        <Modal title="What do you want to record?" onClose={() => setPicker(false)}>
          <div className="kinds">
            {KINDS.map(k => (
              <button className="kind-btn" key={k} onClick={() => { setPicker(false); go({ name: 'new', kind: k }); }}>
                <span aria-hidden>{KIND_LABEL[k].split(' ')[0]}</span>
                {KIND_LABEL[k].split(' ').slice(1).join(' ')}
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
      <p><a href="#/items">← All items</a></p>
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          <h2 style={{ margin: 0 }}>{KIND_LABEL[item.kind]} {item.title}</h2>
          <Badge tone={item.cancelledAt ? 'info' : 'ok'}>{item.cancelledAt ? `❌ Cancelled ${formatDate(item.cancelledAt)}` : '✅ Active'}</Badge>
        </div>
        <p className="muted">Category: {item.category} {item.notes && <>· Notes: {item.notes}</>}</p>
        {method && <p>Paid with: <b>{method.name} ••{method.last4}</b>{method.type === 'card' && method.expiryMonth ? ` (valid until ${formatDate(toISODate(endOfMonthSafe(method.expiryMonth)))})` : ''}</p>}

        {item.kind === 'purchase' && (
          <div>
            <p>Price: <b>{formatMoney(item.price, item.currency)}</b> on {formatDate(item.purchaseDate)}</p>
            {item.serialNumber && <p>Serial: <span className="mono">{item.serialNumber}</span></p>}
            {item.orderNumber && <p>Order no.: <span className="mono">{item.orderNumber}</span></p>}
            <ul>
              {warrantiesOf(item).map(w => <li key={w.label}>{w.label}: until <b>{formatDate(w.end)}</b> {today > w.end ? <Badge tone="overdue">⚠ Expired</Badge> : <Badge tone="ok">ℹ Active</Badge>}</li>)}
            </ul>
            <p>If something is wrong: <b>{claimStatus(item, today)}</b> — <a href={`#/assistant/${item.id}`}>🤖 write a claim/return letter</a></p>
          </div>
        )}

        {item.kind === 'installment' && (() => {
          const s = installmentStatus(item, today);
          return (
            <div>
              <p>Rate: <b>{formatMoney(item.rateAmount, item.currency)}</b> every {item.interval}</p>
              <p>Left: <b>{formatMoney(s.remaining, item.currency)}</b> · payments left: <b>{s.paymentsLeft}</b> · next: {s.nextPayment ? formatDate(s.nextPayment) : '—'} · paid off: {s.payoffDate ? formatDate(s.payoffDate) : '—'}</p>
            </div>
          );
        })()}

        {item.kind === 'subscription' && (
          <div>
            <p>Price: <b>{formatMoney(item.price, item.currency)}</b> every {item.interval} (= {formatMoney(monthlyCost(item), item.currency)}/month)</p>
            <p>Next charge: <b>{nextCharge(item, today) ? formatDate(nextCharge(item, today)!) : '—'}</b>{item.trialEnds && item.trialEnds > today ? ` (free trial until ${formatDate(item.trialEnds)})` : ''}</p>
            {item.minTermMonths ? <p>Minimum term: {item.minTermMonths} months</p> : null}
          </div>
        )}

        {item.kind === 'contract' && (() => {
          const d = cancellationDeadline(item, today);
          return (
            <div>
              <p>Price: <b>{formatMoney(item.price, item.currency)}</b> every {item.interval} (= {formatMoney(monthlyCost(item), item.currency)}/month)</p>
              <p>Term: {item.minTermMonths} months from {formatDate(item.startDate)}, then renews every {item.renewalPeriodMonths} month(s), notice {item.noticePeriodMonths} month(s)</p>
              <p>Cancel by: <b>{formatDate(d.deadline)}</b> for term ending <b>{formatDate(d.termEnd)}</b> {d.missed ? '' : ''} <Badge tone={d.deadline < today ? 'overdue' : d.deadline === today ? 'today' : 'later'}>{d.deadline < today ? '⚠ Overdue' : d.deadline === today ? '⏰ Today' : `ℹ ${d.deadline}`}</Badge></p>
              <p><a href={`#/assistant/${item.id}`}>🤖 Write cancellation letter</a></p>
            </div>
          );
        })()}

        {item.kind === 'document' && (
          <div>
            <p>Valid until: <b>{formatDate(documentValidUntil(item))}</b> <Badge tone={documentValidUntil(item) < today ? 'overdue' : 'ok'}>{documentValidUntil(item) < today ? '⚠ Expired' : 'ℹ Valid'}</Badge></p>
            <p>Reminder: {item.remindDaysBefore} days before{item.repeatMonths ? ` · repeats every ${item.repeatMonths} months` : ''}</p>
            <button className="btn" onClick={async () => { await db.items.put({ ...item, renewedAt: today, updatedAt: today } as VaultItem); }}>✅ I renewed it</button>
          </div>
        )}

        {item.cancelledAt && paidUntil(item) && <p className="muted">Still costs money until {formatDate(paidUntil(item)!)} (paid period / term end).</p>}

        {item.account && (item.account.customerNumber || item.account.contractNumber || item.account.cancelUrl || item.account.cancelEmail || item.account.cancelPhone) && (
          <div>
            <h3>Cancellation info</h3>
            {item.account.customerNumber && <p>Customer number: <span className="mono">{item.account.customerNumber}</span></p>}
            {item.account.contractNumber && <p>Contract number: <span className="mono">{item.account.contractNumber}</span></p>}
            {item.account.cancelUrl && <p>Cancellation website: <a href={item.account.cancelUrl}>{item.account.cancelUrl}</a></p>}
            {item.account.cancelEmail && <p>Email: <a href={`mailto:${item.account.cancelEmail}`}>{item.account.cancelEmail}</a></p>}
            {item.account.cancelPhone && <p>Phone: {item.account.cancelPhone}</p>}
          </div>
        )}

        {item.priceHistory.length > 0 && (
          <div>
            <h3>Price history</h3>
            <ul>{item.priceHistory.map((p, i) => <li key={i}>{formatDate(p.date)}: {formatMoney(p.amount, p.currency)}{p.note ? ` (${p.note})` : ''}</li>)}</ul>
          </div>
        )}

        {item.attachments.length > 0 && (
          <div>
            <h3>Receipts & documents</h3>
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
          <button className="btn" onClick={() => go({ name: 'edit', id: item.id })}>✏️ Edit</button>
          <button className="btn" onClick={cancel}>{item.cancelledAt ? '↩️ Undo cancellation' : '❌ Mark cancelled'}</button>
          {confirmDelete
            ? <button className="btn danger" onClick={async () => { await db.items.delete(item.id); go({ name: 'items' }); }}>Really delete?</button>
            : <button className="btn danger" onClick={() => setConfirmDelete(true)}>🗑 Delete</button>}
        </div>
      </div>
    </div>
  );
}

function endOfMonthSafe(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0);
}
