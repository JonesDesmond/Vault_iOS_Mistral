export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(amount: number, currency = 'EUR', locale = 'en-IE'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${round2(amount).toFixed(2)} ${currency}`;
  }
}

export const INTERVALS_PER_YEAR: Record<string, number> = {
  week: 52,
  month: 12,
  quarter: 4,
  year: 1
};

/** Convert an amount per interval into an amount per month. */
export function toMonthly(amount: number, interval: string): number {
  const perYear = INTERVALS_PER_YEAR[interval] ?? 12;
  return round2((amount * perYear) / 12);
}
