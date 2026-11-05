import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { SubscriptionItem } from '../types';
import { fixedMonthlyCost, monthSpend } from '../lib/calc';
import { parseISODate, todayISO } from '../lib/dates';
import { formatMoney, round2, INTERVALS_PER_YEAR } from '../lib/money';
import { Field } from '../components/ui';

const RATINGS = [
  { v: 'often', label: 'Often' },
  { v: 'sometimes', label: 'Sometimes' },
  { v: 'rarely', label: 'Rarely' },
  { v: 'never', label: 'Never' }
] as const;

export default function Review() {
  const items = useLiveQuery(() => db.items.toArray());
  const settings = useLiveQuery(() => getSettings());
  const [rated, setRated] = useState<Record<string, string>>({});

  const today = todayISO();
  const now = parseISODate(today);
  const year = now.getFullYear();
  const month0 = now.getMonth();

  const review = useMemo(() => {
    if (!items) return null;
    let spentYTD = 0;
    for (let m = 0; m <= month0; m++) spentYTD += monthSpend(items, year, m);
    let lastYear = 0;
    for (let m = 0; m < 12; m++) lastYear += monthSpend(items, year - 1, m);
    const expected = round2(fixedMonthlyCost(items, today) * (month0 + 1));
    const yearly = items
      .filter(i => i.kind !== 'document')
      .map(i => ({ i, y: i.kind === 'purchase' ? i.price : (i.kind === 'subscription' || i.kind === 'contract') ? i.price * INTERVALS_PER_YEAR[i.interval] : 0 }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 6);
    const increases = items.flatMap(i => i.priceHistory.slice(1).map((p, idx) => ({ item: i.title, from: i.priceHistory[idx], to: p })));
    const cancellations = items.filter(i => i.cancelledAt && i.cancelledAt.startsWith(String(year))).length;
    return { spentYTD: round2(spentYTD), lastYear: round2(lastYear), expected, yearly, increases, cancellations };
  }, [items, today, year, month0]);

  if (!items || !settings || !review) return <p className="muted">Loading…</p>;

  const subs = items.filter((i): i is SubscriptionItem => i.kind === 'subscription');
  const savingsYear = round2(subs.reduce((a, s) => {
    const r = rated[s.id] ?? s.usageRating;
    return a + (r === 'rarely' || r === 'never' ? s.price * INTERVALS_PER_YEAR[s.interval] : 0);
  }, 0));

  const setRating = async (id: string, v: string) => {
    setRated(r => ({ ...r, [id]: v }));
    await db.items.update(id, { usageRating: v as any, updatedAt: todayISO() });
  };

  return (
    <div>
      <h1>📊 Review</h1>

      <h2>Subscription check-up</h2>
      <p className="muted">Rate how often you use each subscription. "Rarely" and "never" show what you could save per year.</p>
      <div className="list">
        {subs.map(s => (
          <div className="card item-row" key={s.id}>
            <div className="grow">
              <div className="item-title">🔁 {s.title}</div>
              <div className="item-sub">{formatMoney(s.price, s.currency)}/{s.interval} = {formatMoney(round2(s.price * INTERVALS_PER_YEAR[s.interval] / 12), s.currency)}/month</div>
            </div>
            <select value={rated[s.id] ?? s.usageRating ?? ''} onChange={e => setRating(s.id, e.target.value)} style={{ width: 'auto' }}>
              <option value="">— rate —</option>
              {RATINGS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
            </select>
          </div>
        ))}
        {subs.length === 0 && <p className="muted">No subscriptions yet.</p>}
      </div>
      {savingsYear > 0 && <div className="banner warn">⚠ You could save about <b>{formatMoney(savingsYear, settings.currency)}/year</b> by cancelling rarely/never used subscriptions.</div>}

      <h2>Year in review — {year}</h2>
      <div className="tiles">
        <div className="tile"><div className="tile-label">Spent so far ({year})</div><div className="tile-value">{formatMoney(review.spentYTD, settings.currency)}</div></div>
        <div className="tile"><div className="tile-label">Expected for the year</div><div className="tile-value">{formatMoney(review.expected, settings.currency)}</div></div>
        <div className="tile"><div className="tile-label">Spent in {year - 1}</div><div className="tile-value">{formatMoney(review.lastYear, settings.currency)}</div></div>
        <div className="tile"><div className="tile-label">Cancellations in {year}</div><div className="tile-value">{review.cancellations}</div></div>
      </div>

      <h3>Biggest items (yearly)</h3>
      <div className="list">
        {review.yearly.map(({ i, y }) => (
          <div className="event-row" key={i.id}><span className="event-title">{i.title} <span className="muted">({i.kind})</span></span><b>{formatMoney(y, settings.currency)}/yr</b></div>
        ))}
        {review.yearly.length === 0 && <p className="muted">Nothing recorded yet.</p>}
      </div>

      {review.increases.length > 0 && (
        <>
          <h3>Price increases</h3>
          <div className="list">
            {review.increases.map((p, idx) => (
              <div className="event-row" key={idx}><span className="event-title">📈 {p.item}: {formatMoney(p.from.amount, p.from.currency)} → {formatMoney(p.to.amount, p.to.currency)}</span></div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
