import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import { fixedMonthlyCost, monthSpend, installmentStatus } from '../lib/calc';
import { deadlinesNext90 } from '../lib/events';
import { evaluateAllLimits } from '../lib/limits';
import { addMonths, endOfMonth, formatDate, formatMonthYear, parseISODate, startOfMonth, toISODate, todayISO } from '../lib/dates';
import { formatMoney, round2, INTERVALS_PER_YEAR } from '../lib/money';
import { Tile, Badge, kindLabel } from '../components/ui';
import { go } from '../App';
import { t } from '../lib/i18n';

export default function Overview() {
  const items = useLiveQuery(() => db.items.toArray());
  const methods = useLiveQuery(() => db.paymentMethods.toArray());
  const settings = useLiveQuery(() => getSettings());
  const inboxCount = useLiveQuery(() => db.inbox.count());

  if (!items || !methods || !settings) return <p className="muted">{t('Loading…')}</p>;

  const today = todayISO();
  const now = parseISODate(today);
  const year = now.getFullYear();
  const month0 = now.getMonth();
  const income = settings.monthlyIncome ?? 0;

  const fixedMonth = fixedMonthlyCost(items, today);
  const installmentsLeft = round2(items.reduce((a, i) => a + (i.kind === 'installment' ? installmentStatus(i, today).remaining : 0), 0));
  const due30 = deadlinesNext90(items, methods, today).filter(e => e.date <= toISODate(addMonths(now, 1)));
  const savingsYear = round2(items.reduce((a, i) => a + (i.kind === 'subscription' && (i.usageRating === 'rarely' || i.usageRating === 'never') ? i.price * INTERVALS_PER_YEAR[i.interval] : 0), 0));

  const limitEvals = evaluateAllLimits(items, settings.limits, income, year, month0);
  const worst = limitEvals.filter(l => l.level !== 'ok');

  // 12-month chart
  const months: { label: string; spend: number }[] = [];
  for (let k = 11; k >= 0; k--) {
    const d = addMonths(startOfMonth(now), -k);
    months.push({ label: formatMonthYear(d).split(' ')[0].slice(0, 3), spend: monthSpend(items, d.getFullYear(), d.getMonth()) });
  }
  const allLimit = settings.limits.find(l => l.scope === 'all');
  const limitBudget = allLimit ? (allLimit.mode === 'fixed' ? (allLimit.amount ?? 0) : round2(income * (allLimit.percent ?? 0) / 100)) : 0;
  const maxVal = Math.max(...months.map(m => m.spend), limitBudget, 1);

  // categories this month
  const catMap = new Map<string, number>();
  for (const i of items) {
    if (i.kind === 'document') continue;
    const s = monthSpend([i], year, month0);
    if (s > 0) catMap.set(i.category, round2((catMap.get(i.category) ?? 0) + s));
  }
  const cats = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const catMax = Math.max(...cats.map(c => c[1]), 1);

  const backupAge = settings.lastBackupAt ? Math.round((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000) : null;

  return (
    <div>
      <h1>{t('Overview')}</h1>

      {worst.map(w => (
        <div key={w.limit.id} className={`banner ${w.level === 'over' || w.level === 'warn100' ? 'danger' : 'warn'}`} role="alert">
          {w.message} — {t('spent {spent} of {budget} this month.', { spent: formatMoney(w.spent, settings.currency), budget: formatMoney(w.budget, settings.currency) })}
        </div>
      ))}
      {inboxCount ? <div className="banner info">📥 {inboxCount} {t('files waiting in the inbox.')} <a href="#/inbox">{t('Inbox')}</a></div> : null}
      {backupAge === null || backupAge > 90 ? (
        <div className="banner info">💾 {backupAge === null ? t('No backup yet') : t('Last backup {n} days ago', { n: backupAge })} — <a href="#/settings">{t('make a backup in Settings.')}</a></div>
      ) : null}

      <div className="tiles">
        <Tile label={t('Fixed costs / month')} value={formatMoney(fixedMonth, settings.currency)} />
        <Tile label={t('Fixed costs / year')} value={formatMoney(round2(fixedMonth * 12), settings.currency)} />
        <Tile label={t('% of income')} value={income > 0 ? `${round2(fixedMonth / income * 100)}%` : '—'} sub={income > 0 ? formatMoney(income, settings.currency) : t('set income in Settings')} />
        <Tile label={t('Money left / month')} value={income > 0 ? formatMoney(round2(income - fixedMonth), settings.currency) : '—'} sub={income > 0 ? t('income minus fixed costs') : ''} />
        <Tile label={t('Installments left')} value={formatMoney(installmentsLeft, settings.currency)} sub={`${items.filter(i => i.kind === 'installment' && !installmentStatus(i, today).done).length} ${t('active plans')}`} />
        <Tile label={t('Due in 30 days')} value={due30.length} sub={`${due30.filter(e => e.kind !== 'payment').length} ${t('deadlines')}`} tone={due30.some(e => e.urgency === 'overdue') ? 'danger' : due30.some(e => e.urgency === 'today' || e.urgency === 'soon') ? 'warn' : undefined} />
      </div>

      <div className="section-title"><h2>{t('Next 90 days')}</h2><a className="btn" href="#/calendar">📅 {t('Calendar')}</a></div>
      <div className="list">
        {deadlinesNext90(items, methods, today).slice(0, 10).map((e, i) => (
          <div className="event-row" key={i}>
            <span className="event-date">{formatDate(e.date)}</span>
            <span className="event-title"><Badge tone={e.urgency}>{e.urgencyLabel}</Badge> {kindLabel(items.find(x => x.id === e.itemId)?.kind ?? '')} {e.title}</span>
          </div>
        ))}
        {deadlinesNext90(items, methods, today).length === 0 && <p className="muted">{t('Nothing due in the next 90 days.')} 🎉</p>}
      </div>

      <div className="section-title"><h2>{t('Last 12 months')} {limitBudget > 0 && <span className="muted">(— — = {formatMoney(limitBudget, settings.currency)})</span>}</h2></div>
      <div className="card">
        <div className="chart">
          {limitBudget > 0 && (
            <div className="chart-limit-line" style={{ bottom: `${(limitBudget / maxVal) * 100}%` }}>
              <span className="chart-limit-label">limit {formatMoney(limitBudget, settings.currency)}</span>
            </div>
          )}
          {months.map((m, i) => (
            <div className="chart-bar-wrap" key={i}>
              <div
                className={`chart-bar ${limitBudget > 0 && m.spend > limitBudget ? 'over' : ''}`}
                style={{ height: `${Math.max(2, (m.spend / maxVal) * 100)}%` }}
                title={`${m.label}: ${formatMoney(m.spend, settings.currency)}`}
              />
            </div>
          ))}
        </div>
        <div className="chart-x">{months.map((m, i) => <span key={i}>{m.label}</span>)}</div>
      </div>

      <div className="section-title"><h2>{t('This month by category')}</h2></div>
      <div className="card">
        {cats.length === 0 && <p className="muted">{t('No spending this month yet.')}</p>}
        {cats.map(([cat, amt]) => (
          <div className="cat-row" key={cat}>
            <span>{cat}</span>
            <span style={{ background: 'var(--surface-2)', borderRadius: 5, height: 10, display: 'block' }}>
              <span className="cat-bar" style={{ width: `${(amt / catMax) * 100}%`, display: 'block' }} />
            </span>
            <span className="cat-amt">{formatMoney(amt, settings.currency)}</span>
          </div>
        ))}
      </div>

      <div className="section-title"><h2>{t('Possible savings')}</h2><a className="btn" href="#/review">📊 {t('Review')}</a></div>
      <div className="card">
        {savingsYear > 0
          ? <p>{t('Subscriptions you rated rarely or never cost {amount}/year. Rate them in Review.', { amount: formatMoney(savingsYear, settings.currency) })}</p>
          : <p className="muted">{t('Rate your subscriptions in Review to see what you could save per year.')}</p>}
      </div>

      <p className="muted">{t('Today:')} {formatDate(today)} · {t('All data stays on this device.')}</p>
      <button className="btn" onClick={() => go({ name: 'items' })}>➕ {t('Add item')}</button>
    </div>
  );
}
