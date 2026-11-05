// Calendar events and deadlines derived from items. Pure functions.

import type { VaultItem, ContractItem, SubscriptionItem, DocumentItem, PaymentMethod } from '../types';
import { addDays, daysBetween, parseISODate, toISODate } from './dates';
import {
  paymentDatesBetween, cancellationDeadline, currentTermEnd, returnWindowEnd,
  legalGuaranteeEnd, warrantyEnd, documentValidUntil, cardValidUntil, itemsPaidWith, installmentStatus
} from './calc';

export type Urgency = 'overdue' | 'today' | 'soon' | 'later';

export interface CalEvent {
  date: string;
  kind: 'payment' | 'deadline' | 'expiry' | 'reminder';
  itemId: string;
  title: string;
  amount?: number;
  currency?: string;
  urgency: Urgency;
  urgencyLabel: string; // icon + words, never color alone
  history: boolean;    // past payment
}

export function urgencyOf(dateISO: string, asOfISO: string): { urgency: Urgency; label: string } {
  const d = daysBetween(parseISODate(asOfISO), parseISODate(dateISO));
  if (d < 0) return { urgency: 'overdue', label: `⚠ Overdue by ${-d} day${-d === 1 ? '' : 's'}` };
  if (d === 0) return { urgency: 'today', label: '⏰ Today' };
  if (d <= 7) return { urgency: 'soon', label: `⏰ In ${d} day${d === 1 ? '' : 's'}` };
  return { urgency: 'later', label: `ℹ In ${d} days` };
}

function ev(date: string, e: Omit<CalEvent, 'date' | 'urgency' | 'urgencyLabel' | 'history'>, asOfISO: string): CalEvent {
  const { urgency, label } = urgencyOf(date, asOfISO);
  return { ...e, date, urgency, urgencyLabel: label, history: date < asOfISO };
}

export function eventsBetween(items: VaultItem[], methods: PaymentMethod[], fromISO: string, toISO: string, asOfISO: string): CalEvent[] {
  const out: CalEvent[] = [];
  for (const item of items) {
    if (item.kind === 'subscription' || item.kind === 'contract' || item.kind === 'installment') {
      for (const d of paymentDatesBetween(item, fromISO, toISO)) {
        const amount = item.kind === 'installment' ? item.rateAmount : item.price;
        out.push(ev(d, { kind: 'payment', itemId: item.id, title: `${item.title} — payment`, amount, currency: item.currency }, asOfISO));
      }
    }
    if (item.kind === 'contract') {
      const dl = cancellationDeadline(item, asOfISO);
      if (dl.deadline >= fromISO && dl.deadline <= toISO) {
        out.push(ev(dl.deadline, { kind: 'deadline', itemId: item.id, title: `${item.title} — cancel by this date (term ends ${dl.termEnd})` }, asOfISO));
      }
      const te = currentTermEnd(item, asOfISO);
      if (te >= fromISO && te <= toISO && te !== dl.deadline) {
        out.push(ev(te, { kind: 'deadline', itemId: item.id, title: `${item.title} — term ends` }, asOfISO));
      }
    }
    if (item.kind === 'subscription' && item.minTermMonths) {
      const pseudo: ContractItem = { ...item, kind: 'contract', startDate: item.firstChargeDate, minTermMonths: item.minTermMonths, renewalPeriodMonths: 1, noticePeriodMonths: 0 } as ContractItem;
      const te = currentTermEnd(pseudo, asOfISO);
      if (te >= fromISO && te <= toISO) out.push(ev(te, { kind: 'deadline', itemId: item.id, title: `${item.title} — minimum term ends` }, asOfISO));
    }
    if (item.kind === 'purchase') {
      const rw = returnWindowEnd(item);
      if (rw >= fromISO && rw <= toISO) out.push(ev(rw, { kind: 'deadline', itemId: item.id, title: `${item.title} — return window ends` }, asOfISO));
      const lg = legalGuaranteeEnd(item);
      if (lg >= fromISO && lg <= toISO) out.push(ev(lg, { kind: 'expiry', itemId: item.id, title: `${item.title} — legal guarantee ends` }, asOfISO));
      if (item.warrantyMonths) {
        const w = warrantyEnd(item, item.warrantyMonths);
        if (w >= fromISO && w <= toISO) out.push(ev(w, { kind: 'expiry', itemId: item.id, title: `${item.title} — manufacturer warranty ends` }, asOfISO));
      }
    }
    if (item.kind === 'installment') {
      const s = installmentStatus(item, asOfISO);
      if (s.payoffDate && s.payoffDate >= fromISO && s.payoffDate <= toISO) {
        out.push(ev(s.payoffDate, { kind: 'deadline', itemId: item.id, title: `${item.title} — paid off (${s.paymentsLeft} payment${s.paymentsLeft === 1 ? '' : 's'} left)` }, asOfISO));
      }
    }
    if (item.kind === 'document') {
      const validUntil = documentValidUntil(item);
      if (validUntil >= fromISO && validUntil <= toISO) {
        out.push(ev(validUntil, { kind: 'expiry', itemId: item.id, title: `${item.title} — expires` }, asOfISO));
      }
      const remind = toISODate(addDays(parseISODate(validUntil), -item.remindDaysBefore));
      if (remind >= fromISO && remind <= toISO) {
        out.push(ev(remind, { kind: 'reminder', itemId: item.id, title: `${item.title} — reminder (expires ${validUntil})` }, asOfISO));
      }
      if (item.repeatMonths && item.renewedAt) {
        const next = toISODate(addDays(parseISODate(item.renewedAt), 0));
        void next;
      }
    }
  }
  // expiring cards (payment methods)
  for (const m of methods) {
    if (m.type === 'card' && m.expiryMonth) {
      const until = cardValidUntil(m.expiryMonth);
      if (until >= fromISO && until <= toISO) {
        const affected = itemsPaidWith(items, m.id).map(i => i.title).join(', ');
        out.push(ev(until, {
          kind: 'expiry', itemId: `pm-${m.id}`,
          title: `${m.name} ••${m.last4} expires${affected ? ` — update: ${affected}` : ''}`
        }, asOfISO));
      }
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return out;
}

export function deadlinesNext90(items: VaultItem[], methods: PaymentMethod[], asOfISO: string): CalEvent[] {
  const until = toISODate(addDays(parseISODate(asOfISO), 90));
  return eventsBetween(items, methods, asOfISO, until, asOfISO)
    .filter(e => e.kind !== 'payment' || e.urgency === 'overdue' || e.date >= asOfISO);
}
