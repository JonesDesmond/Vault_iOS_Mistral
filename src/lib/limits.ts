// Spending limits: fixed amount or % of income; warn at 70/80/90/100%.

import type { VaultItem, SpendingLimit } from '../types';
import { monthSpend } from './calc';
import { round2 } from './money';

export type LimitLevel = 'ok' | 'warn70' | 'warn80' | 'warn90' | 'warn100' | 'over';

export interface LimitEval {
  limit: SpendingLimit;
  spent: number;
  budget: number;
  pct: number;
  level: LimitLevel;
  message: string; // icon + words, never color alone
}

export function budgetOf(limit: SpendingLimit, monthlyIncome?: number): number {
  if (limit.mode === 'fixed') return limit.amount ?? 0;
  return round2(((monthlyIncome ?? 0) * (limit.percent ?? 0)) / 100);
}

export function scopeSpend(items: VaultItem[], limit: SpendingLimit, year: number, month0: number): number {
  if (limit.scope === 'category' && limit.category) {
    return monthSpend(items.filter(i => i.category === limit.category), year, month0);
  }
  const kindMap: Record<string, string[]> = {
    subscriptions: ['subscription'],
    contracts: ['contract'],
    installments: ['installment']
  };
  if (limit.scope === 'all') return monthSpend(items, year, month0);
  const kinds = kindMap[limit.scope] ?? [];
  return monthSpend(items.filter(i => kinds.includes(i.kind)), year, month0);
}

export function evaluateLimit(limit: SpendingLimit, spent: number, monthlyIncome?: number): LimitEval {
  const budget = budgetOf(limit, monthlyIncome);
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  let level: LimitLevel = 'ok';
  if (pct >= 100) level = 'over';
  else if (pct >= 90) level = 'warn90';
  else if (pct >= 80) level = 'warn80';
  else if (pct >= 70) level = 'warn70';

  const pctText = budget > 0 ? `${Math.round(pct)}%` : '—';
  let message: string;
  switch (level) {
    case 'over': message = `⛔ Limit reached or exceeded: ${pctText} of "${limit.label}" used`; break;
    case 'warn90': message = `⚠ 90% of limit "${limit.label}" reached`; break;
    case 'warn80': message = `⚠ 80% of limit "${limit.label}" reached`; break;
    case 'warn70': message = `⚠ 70% of limit "${limit.label}" reached`; break;
    default: message = `ℹ Within limit "${limit.label}" (${pctText})`;
  }
  return { limit, spent: round2(spent), budget: round2(budget), pct: round2(pct), level, message };
}

export function evaluateAllLimits(items: VaultItem[], limits: SpendingLimit[], monthlyIncome: number | undefined, year: number, month0: number): LimitEval[] {
  return limits.map(l => evaluateLimit(l, scopeSpend(items, l, year, month0), monthlyIncome));
}

/** Limit check to show in the form before saving a new/changed item. */
export function checkItemAgainstLimits(item: VaultItem, items: VaultItem[], limits: SpendingLimit[], monthlyIncome: number | undefined, monthISO: string): LimitEval[] {
  const [y, m] = monthISO.split('-').map(Number);
  const others = items.filter(i => i.id !== item.id);
  const withNew = [...others, item];
  return evaluateAllLimits(withNew, limits, monthlyIncome, y, m - 1);
}
