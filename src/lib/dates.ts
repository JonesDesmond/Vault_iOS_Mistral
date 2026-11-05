// Pure date helpers. All dates are local-time calendar dates (midnight), ISO 'YYYY-MM-DD'.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return r;
}

/** Add calendar months, clamping the day (31 Jan + 1 month -> 28/29 Feb). */
export function addMonths(d: Date, n: number): Date {
  const total = d.getFullYear() * 12 + d.getMonth() + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  const dim = daysInMonth(y, m);
  return new Date(y, m, Math.min(d.getDate(), dim));
}

export function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), daysInMonth(d.getFullYear(), d.getMonth()));
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86400000);
}

/** Whole calendar months from a to b (b >= a), counting a partial month as 0. */
export function monthsBetween(a: Date, b: Date): number {
  let n = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) n -= 1;
  return n;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function formatDate(iso: string, locale = 'en-GB'): string {
  if (!iso) return '';
  const d = parseISODate(iso);
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatMonthYear(d: Date, locale = 'en-GB'): string {
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/** Monday-based weekday index: Mon=0 .. Sun=6 */
export function mondayWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function clampDay(y: number, m0: number, day: number): Date {
  return new Date(y, m0, Math.min(day, daysInMonth(y, m0)));
}
