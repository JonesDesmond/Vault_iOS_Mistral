// Pure calculation functions for Receipt Vault.
// No database, no DOM, no network — every function here is unit-testable.

import type {
  VaultItem, PurchaseItem, InstallmentItem, SubscriptionItem, ContractItem, DocumentItem, Interval
} from '../types';
import { addDays, addMonths, daysBetween, endOfMonth, parseISODate, toISODate } from './dates';
import { round2, toMonthly } from './money';

export function addInterval(d: Date, interval: Interval, n: number): Date {
  switch (interval) {
    case 'week': return addDays(d, 7 * n);
    case 'quarter': return addMonths(d, 3 * n);
    case 'year': return addMonths(d, 12 * n);
    case 'month':
    default: return addMonths(d, n);
  }
}

/** Base monthly cost of an item, ignoring cancellation. */
export function monthlyCost(item: VaultItem): number {
  switch (item.kind) {
    case 'subscription':
    case 'contract':
      return toMonthly(item.price, item.interval);
    case 'installment':
      return toMonthly(item.rateAmount, item.interval);
    default:
      return 0; // purchases and documents are one-off
  }
}

/** The date until which a cancelled item still costs money. */
export function paidUntil(item: VaultItem): string | undefined {
  switch (item.kind) {
    case 'contract': {
      const termEnd = currentTermEnd(item, item.cancelledAt ?? toISODate(new Date()));
      return termEnd;
    }
    case 'subscription': {
      if (!item.minTermMonths) return undefined;
      const pseudo: ContractItem = {
        ...item, kind: 'contract', startDate: item.firstChargeDate,
        minTermMonths: item.minTermMonths, renewalPeriodMonths: 1, noticePeriodMonths: 0
      };
      return currentTermEnd(pseudo, item.cancelledAt ?? toISODate(new Date()));
    }
    case 'installment': {
      const s = installmentStatus(item, item.cancelledAt ?? toISODate(new Date()));
      return s.payoffDate;
    }
    default:
      return undefined;
  }
}

/** Monthly cost that actually counts in the month of `asOfISO` (cancelled items keep costing until paid period ends). */
export function countedMonthlyCost(item: VaultItem, asOfISO: string): number {
  if (item.kind === 'installment') {
    const s = installmentStatus(item, asOfISO);
    if (s.done) return 0;
  }
  if (item.cancelledAt) {
    const until = paidUntil(item);
    if (until && asOfISO > until) return 0;
  }
  return monthlyCost(item);
}

// ---------- Installments ----------

export interface InstallmentStatus {
  paid: number;
  remaining: number;
  paymentsMade: number;
  paymentsLeft: number;
  nextPayment?: string;
  payoffDate?: string;
  done: boolean;
}

export function installmentStatus(item: InstallmentItem, asOfISO: string): InstallmentStatus {
  const asOf = parseISODate(asOfISO);
  const rate = item.rateAmount;

  if (item.remainingAmount != null && item.nextPaymentDate) {
    // "What's left" entry: remaining amount + next payment date.
    let next = parseISODate(item.nextPaymentDate);
    let remaining = round2(item.remainingAmount);
    while (remaining > 0 && next < asOf) {
      remaining = round2(remaining - rate);
      next = addInterval(next, item.interval, 1);
    }
    const paymentsLeft = remaining <= 0 ? 0 : Math.ceil(remaining / rate - 1e-9);
    return {
      paid: round2(Math.max(0, item.remainingAmount - remaining)),
      remaining: round2(Math.max(0, remaining)),
      paymentsMade: 0,
      paymentsLeft,
      nextPayment: paymentsLeft > 0 ? toISODate(next) : undefined,
      payoffDate: paymentsLeft > 0 ? toISODate(addInterval(next, item.interval, paymentsLeft - 1)) : undefined,
      done: remaining <= 0
    };
  }

  const total = item.totalAmount ?? 0;
  const first = parseISODate(item.firstPaymentDate ?? asOfISO);
  let k = 0;
  while (addInterval(first, item.interval, k) <= asOf) k += 1;
  const paymentsMade = k;
  const paid = round2(Math.min(total, k * rate));
  const remaining = round2(Math.max(0, total - k * rate));
  const paymentsLeft = remaining <= 0 ? 0 : Math.ceil(remaining / rate - 1e-9);
  return {
    paid,
    remaining,
    paymentsMade,
    paymentsLeft,
    nextPayment: paymentsLeft > 0 ? toISODate(addInterval(first, item.interval, k)) : undefined,
    payoffDate: paymentsLeft > 0
      ? toISODate(addInterval(first, item.interval, k + paymentsLeft - 1))
      : (k > 0 ? toISODate(addInterval(first, item.interval, k - 1)) : undefined),
    done: remaining <= 0
  };
}

// ---------- Contracts & subscriptions: terms, deadlines ----------

/** End of the initial term: start + minTerm months, minus one day. (1 Mar 2025 + 24m -> 28 Feb 2027) */
export function initialTermEnd(startISO: string, minTermMonths: number): string {
  return toISODate(addDays(addMonths(parseISODate(startISO), minTermMonths), -1));
}

/** End of the term that contains asOfISO. */
export function currentTermEnd(item: ContractItem, asOfISO: string): string {
  const start = parseISODate(item.startDate);
  const initEnd = addDays(addMonths(start, item.minTermMonths), -1);
  const asOf = parseISODate(asOfISO);
  if (asOf <= initEnd) return toISODate(initEnd);
  let nextStart = addDays(initEnd, 1);
  let guard = 0;
  while (guard++ < 1200) {
    const nextEnd = addDays(addMonths(nextStart, item.renewalPeriodMonths), -1);
    if (asOf <= nextEnd) return toISODate(nextEnd);
    nextStart = addDays(nextEnd, 1);
  }
  return toISODate(initEnd);
}

export interface DeadlineInfo {
  deadline: string;   // last day to cancel for the current term
  termEnd: string;    // end of the term the deadline applies to
  missed: boolean;    // deadline already passed -> rolled over to next term
}

/** Cancellation deadline = end of current term minus notice period; a missed deadline rolls over to the next term. */
export function cancellationDeadline(item: ContractItem, asOfISO: string): DeadlineInfo {
  const asOf = parseISODate(asOfISO);
  let termEnd = currentTermEnd(item, asOfISO);
  let deadline = toISODate(addMonths(parseISODate(termEnd), -item.noticePeriodMonths));
  let missed = daysBetween(asOf, parseISODate(deadline)) < 0;
  if (missed) {
    const nextStart = addDays(parseISODate(termEnd), 1);
    termEnd = toISODate(addDays(addMonths(nextStart, item.renewalPeriodMonths), -1));
    deadline = toISODate(addMonths(parseISODate(termEnd), -item.noticePeriodMonths));
    missed = false;
  }
  return { deadline, termEnd, missed };
}

// ---------- Charges (subscriptions, contracts, installments) ----------

/** All payment dates of an item inside [fromISO, toISO] inclusive. */
export function paymentDatesBetween(item: VaultItem, fromISO: string, toISO: string): string[] {
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO);
  const out: string[] = [];
  let start: Date | null = null;
  let interval: Interval | null = null;
  let cap: Date | null = null; // payoff / term end cap

  if (item.kind === 'subscription') {
    start = parseISODate(item.firstChargeDate);
    interval = item.interval;
  } else if (item.kind === 'contract') {
    start = parseISODate(item.firstChargeDate ?? item.startDate);
    interval = item.interval;
  } else if (item.kind === 'installment') {
    const s = installmentStatus(item, toISO);
    if (item.nextPaymentDate) start = parseISODate(item.nextPaymentDate);
    else if (item.firstPaymentDate) start = parseISODate(item.firstPaymentDate);
    interval = item.interval;
    if (s.payoffDate) cap = parseISODate(s.payoffDate);
  } else {
    return out;
  }
  if (!start || !interval) return out;

  let d = start;
  let guard = 0;
  while (d <= to && guard++ < 5000) {
    if (d >= from && (!cap || d <= cap)) out.push(toISODate(d));
    d = addInterval(d, interval, 1);
  }
  return out;
}

/** Next charge on or after asOfISO. */
export function nextCharge(item: VaultItem, asOfISO: string): string | undefined {
  if (item.kind === 'subscription' && item.trialEnds && item.trialEnds > asOfISO) return item.trialEnds;
  if (item.kind === 'installment') return installmentStatus(item, asOfISO).nextPayment;
  const dates = paymentDatesBetween(item, asOfISO, toISODate(addMonths(parseISODate(asOfISO), 24)));
  return dates[0];
}

// ---------- Purchases: return window, guarantees, warranties ----------

export function returnWindowEnd(item: PurchaseItem): string {
  return toISODate(addDays(parseISODate(item.purchaseDate), item.returnWindowDays));
}

export function legalGuaranteeEnd(item: PurchaseItem): string {
  return toISODate(addMonths(parseISODate(item.purchaseDate), item.legalGuaranteeMonths));
}

export function warrantyEnd(item: PurchaseItem, months: number): string {
  return toISODate(addMonths(parseISODate(item.purchaseDate), months));
}

export interface WarrantyInfo { label: string; end: string; }

export function warrantiesOf(item: PurchaseItem): WarrantyInfo[] {
  const out: WarrantyInfo[] = [
    { label: `Return window (${item.returnWindowDays} days)`, end: returnWindowEnd(item) },
    { label: `Legal guarantee (${item.legalGuaranteeMonths} months)`, end: legalGuaranteeEnd(item) }
  ];
  if (item.warrantyMonths) out.push({ label: `Manufacturer warranty (${item.warrantyMonths} months)`, end: warrantyEnd(item, item.warrantyMonths) });
  if (item.extendedWarrantyMonths) out.push({ label: `Extended warranty (${item.extendedWarrantyMonths} months)`, end: warrantyEnd(item, item.extendedWarrantyMonths) });
  return out;
}

export type ClaimKind = 'return' | 'legal-guarantee' | 'manufacturer-warranty' | 'extended-warranty' | 'none';

/** Which protection still applies on asOfISO (checked in order). */
export function claimStatus(item: PurchaseItem, asOfISO: string): ClaimKind {
  if (asOfISO <= returnWindowEnd(item)) return 'return';
  if (asOfISO <= legalGuaranteeEnd(item)) return 'legal-guarantee';
  if (item.warrantyMonths && asOfISO <= warrantyEnd(item, item.warrantyMonths)) return 'manufacturer-warranty';
  if (item.extendedWarrantyMonths && asOfISO <= warrantyEnd(item, item.extendedWarrantyMonths)) return 'extended-warranty';
  return 'none';
}

// ---------- Cards & documents: valid until end of expiry month ----------

/** A card expiring "2026-11" is valid until 30 Nov 2026. */
export function cardValidUntil(expiryMonth: string): string {
  const [y, m] = expiryMonth.split('-').map(Number);
  return toISODate(endOfMonth(new Date(y, m - 1, 1)));
}

export function documentValidUntil(item: DocumentItem): string {
  if (item.expiryMonthOnly && /^\d{4}-\d{2}$/.test(item.expiryDate)) return cardValidUntil(item.expiryDate);
  return item.expiryDate;
}

/** Items paid with the given payment method — warned when that card expires. */
export function itemsPaidWith(items: VaultItem[], paymentMethodId: string): VaultItem[] {
  return items.filter(i => i.paymentMethodId === paymentMethodId);
}

// ---------- Monthly spend (for chart, limits, review) ----------

/** Total spent in a given calendar month (month is 0-based). Counts recurring monthly cost, installment payments and one-off purchases. */
export function monthSpend(items: VaultItem[], year: number, month0: number, income = 0): number {
  const monthStart = toISODate(new Date(year, month0, 1));
  const monthEnd = toISODate(endOfMonth(new Date(year, month0, 1)));
  let sum = 0;
  for (const item of items) {
    const midMonth = toISODate(new Date(year, month0, 15));
    if (item.kind === 'purchase') {
      if (item.purchaseDate >= monthStart && item.purchaseDate <= monthEnd) sum += item.price;
    } else if (item.kind === 'document') {
      // no cost
    } else {
      // active during this month? (cancelled items count until paidUntil)
      const until = item.cancelledAt ? paidUntil(item) : undefined;
      if (until && monthStart > until) continue;
      if (item.kind === 'installment') {
        const dates = paymentDatesBetween(item, monthStart, monthEnd);
        sum += dates.length * item.rateAmount;
      } else {
        sum += countedMonthlyCost(item, midMonth);
      }
    }
  }
  return round2(sum + (income > 0 ? 0 : 0));
}

/** Recurring fixed costs per month (subscriptions + contracts + installments), as of asOfISO. */
export function fixedMonthlyCost(items: VaultItem[], asOfISO: string): number {
  return round2(items.reduce((acc, i) => acc + countedMonthlyCost(i, asOfISO), 0));
}
