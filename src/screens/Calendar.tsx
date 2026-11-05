import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import { eventsBetween, type CalEvent } from '../lib/events';
import { addMonths, daysInMonth, formatDate, formatMonthYear, mondayWeekday, parseISODate, startOfMonth, toISODate, todayISO, endOfMonth } from '../lib/dates';
import { formatMoney, round2 } from '../lib/money';
import { downloadICS } from '../lib/ics';
import { Modal, Badge } from '../components/ui';

const KIND_FILTERS = [
  { key: 'payment', label: '💳 Payments', test: (e: CalEvent) => e.kind === 'payment' },
  { key: 'deadline', label: '⏰ Deadlines', test: (e: CalEvent) => e.kind === 'deadline' },
  { key: 'expiry', label: '⌛ Expiries', test: (e: CalEvent) => e.kind === 'expiry' },
  { key: 'reminder', label: '🔔 Reminders', test: (e: CalEvent) => e.kind === 'reminder' }
];

const EVENT_ICON: Record<string, string> = { payment: '💳', deadline: '⏰', expiry: '⌛', reminder: '🔔' };

export default function CalendarScreen() {
  const items = useLiveQuery(() => db.items.toArray());
  const methods = useLiveQuery(() => db.paymentMethods.toArray());
  const settings = useLiveQuery(() => getSettings());
  const [cursor, setCursor] = useState(() => startOfMonth(parseISODate(todayISO())));
  const [mode, setMode] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState<Set<string>>(new Set(KIND_FILTERS.map(f => f.key)));
  const [day, setDay] = useState<string | null>(null);

  const today = todayISO();
  const year = cursor.getFullYear();
  const month0 = cursor.getMonth();
  const monthStart = toISODate(startOfMonth(cursor));
  const monthEnd = toISODate(endOfMonth(cursor));

  const events = useMemo(() => {
    if (!items || !methods) return [];
    return eventsBetween(items, methods, monthStart, monthEnd, today).filter(e => filters.has(e.kind));
  }, [items, methods, monthStart, monthEnd, today, filters]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') setCursor(c => addMonths(c, -1));
      if (e.key === 'ArrowRight') setCursor(c => addMonths(c, 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!items || !methods || !settings) return <p className="muted">Loading…</p>;

  const monthTotal = round2(events.filter(e => e.kind === 'payment').reduce((a, e) => a + (e.amount ?? 0), 0));

  const cells: (Date | null)[] = [];
  const first = startOfMonth(cursor);
  const offset = mondayWeekday(first);
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth(year, month0); d++) cells.push(new Date(year, month0, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    const arr = eventsByDay.get(e.date) ?? [];
    arr.push(e);
    eventsByDay.set(e.date, arr);
  }

  const exportICS = () => {
    const all = eventsBetween(items, methods, today, toISODate(addMonths(parseISODate(today), 12)), today);
    downloadICS(all, 'receipt-vault.ics');
  };

  return (
    <div>
      <div className="cal-head">
        <h1 style={{ margin: 0 }}>{formatMonthYear(cursor)}</h1>
        <div className="btn-row" style={{ margin: 0 }}>
          <button className="btn icon" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">◀</button>
          <button className="btn" onClick={() => setCursor(startOfMonth(parseISODate(today)))}>Today</button>
          <button className="btn icon" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">▶</button>
          <button className="btn" onClick={exportICS}>📤 Export .ics</button>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Filters">
        {KIND_FILTERS.map(f => (
          <button key={f.key} className={filters.has(f.key) ? 'active' : ''} onClick={() => {
            setFilters(prev => { const n = new Set(prev); n.has(f.key) ? n.delete(f.key) : n.add(f.key); return n; });
          }}>{f.label}</button>
        ))}
      </div>

      <div className="tabs">
        <button className={`btn ${mode === 'grid' ? 'primary' : ''}`} onClick={() => setMode('grid')}>Month grid</button>
        <button className={`btn ${mode === 'list' ? 'primary' : ''}`} onClick={() => setMode('list')}>Month list</button>
      </div>

      <p className="muted">Payments this month: <b>{formatMoney(monthTotal, settings.currency)}</b> · use ← → arrow keys to change month</p>

      {mode === 'grid' && (
        <div>
          <div className="cal-grid">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div className="cal-dow" key={d}>{d}</div>)}
            {cells.map((c, i) => {
              if (!c) return <div key={i} />;
              const iso = toISODate(c);
              const evs = eventsByDay.get(iso) ?? [];
              return (
                <button
                  key={i}
                  className={`cal-day ${iso === today ? 'today' : ''} ${c.getMonth() !== month0 ? 'other-month' : ''}`}
                  onClick={() => setDay(iso)}
                >
                  <span className="d">{c.getDate()}</span>
                  {evs.slice(0, 3).map((e, j) => (
                    <span className="cal-dot" key={j} title={e.title}>
                      <span className="ico" aria-hidden>{EVENT_ICON[e.kind]}</span>
                      <span>{e.title.length > 18 ? e.title.slice(0, 17) + '…' : e.title}</span>
                    </span>
                  ))}
                  {evs.length > 3 && <span className="cal-more">+{evs.length - 3} more</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'list' && (
        <div className="list">
          {[...eventsByDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, evs]) => (
            <div key={date}>
              <h3>{formatDate(date)} {date === today && <Badge tone="today">⏰ Today</Badge>}</h3>
              {evs.map((e, j) => (
                <div className="event-row" key={j}>
                  <span className="event-title"><span aria-hidden>{EVENT_ICON[e.kind]}</span> {e.title}{e.amount != null && <> — <b>{formatMoney(e.amount, e.currency ?? settings.currency)}</b></>}</span>
                  <Badge tone={e.urgency}>{e.urgencyLabel}</Badge>
                </div>
              ))}
            </div>
          ))}
          {events.length === 0 && <p className="muted">No events this month.</p>}
        </div>
      )}

      {day && (
        <Modal title={formatDate(day)} onClose={() => setDay(null)}>
          <div className="list">
            {(eventsByDay.get(day) ?? []).map((e, j) => (
              <div className="event-row" key={j}>
                <span className="event-title"><span aria-hidden>{EVENT_ICON[e.kind]}</span> {e.title}{e.amount != null && <> — <b>{formatMoney(e.amount, e.currency ?? settings.currency)}</b></>}</span>
                <Badge tone={e.urgency}>{e.urgencyLabel}</Badge>
              </div>
            ))}
            {(eventsByDay.get(day) ?? []).length === 0 && <p className="muted">Nothing on this day.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
