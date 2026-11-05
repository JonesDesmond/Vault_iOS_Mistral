import { describe, it, expect } from 'vitest';
import {
  installmentStatus, cancellationDeadline, currentTermEnd, monthlyCost, countedMonthlyCost,
  paymentDatesBetween, nextCharge, cardValidUntil, documentValidUntil, claimStatus,
  returnWindowEnd, legalGuaranteeEnd, itemsPaidWith, fixedMonthlyCost, monthSpend
} from './calc';
import { toMonthly, round2 } from './money';
import type { InstallmentItem, ContractItem, SubscriptionItem, PurchaseItem, DocumentItem, VaultItem } from '../types';

const installment = (over: Partial<InstallmentItem> = {}): InstallmentItem => ({
  id: 'i1', kind: 'installment', title: 'iPad Air 5', category: 'Electronics',
  rateAmount: 50, currency: 'EUR', interval: 'month',
  totalAmount: 300, firstPaymentDate: '2025-06-15',
  attachments: [], priceHistory: [], createdAt: '2025-06-01', updatedAt: '2025-06-01', ...over
});

const contract = (over: Partial<ContractItem> = {}): ContractItem => ({
  id: 'c1', kind: 'contract', title: 'Mobile', category: 'Insurance',
  price: 20, currency: 'EUR', interval: 'month',
  startDate: '2025-03-01', minTermMonths: 24, renewalPeriodMonths: 1, noticePeriodMonths: 1,
  attachments: [], priceHistory: [], createdAt: '2025-03-01', updatedAt: '2025-03-01', ...over
});

describe('installment plans', () => {
  it('iPad Air 5: €300 at €50/month starting 15 Jun -> on 11 Oct: €100 left, 2 payments, paid off 15 Nov', () => {
    const s = installmentStatus(installment(), '2025-10-11');
    expect(s.remaining).toBe(100);
    expect(s.paymentsLeft).toBe(2);
    expect(s.paymentsMade).toBe(4);
    expect(s.payoffDate).toBe('2025-11-15');
    expect(s.nextPayment).toBe('2025-10-15');
    expect(s.done).toBe(false);
  });

  it('is done on the payoff date', () => {
    const s = installmentStatus(installment(), '2025-11-15');
    expect(s.done).toBe(true);
    expect(s.remaining).toBe(0);
    expect(s.paymentsLeft).toBe(0);
    expect(s.payoffDate).toBe('2025-11-15');
  });

  it('supports "what is left" entry: remaining + next payment date', () => {
    const s = installmentStatus(installment({ totalAmount: undefined, firstPaymentDate: undefined, remainingAmount: 100, nextPaymentDate: '2025-10-15' }), '2025-10-11');
    expect(s.remaining).toBe(100);
    expect(s.paymentsLeft).toBe(2);
    expect(s.payoffDate).toBe('2025-11-15');
  });

  it('monthly cost of a monthly installment equals the rate', () => {
    expect(monthlyCost(installment())).toBe(50);
  });
});

describe('contracts: terms and cancellation deadlines', () => {
  it('24 months from 1 Mar 2025, then monthly, 1 month notice -> cancel by 28 Jan 2027, term ends 28 Feb 2027', () => {
    const d = cancellationDeadline(contract(), '2025-06-01');
    expect(d.deadline).toBe('2027-01-28');
    expect(d.termEnd).toBe('2027-02-28');
    expect(d.missed).toBe(false);
    expect(currentTermEnd(contract(), '2026-05-10')).toBe('2027-02-28');
  });

  it('a missed deadline rolls over to the next term', () => {
    const d = cancellationDeadline(contract(), '2027-02-01');
    expect(d.deadline).toBe('2027-02-28');
    expect(d.termEnd).toBe('2027-03-31');
  });

  it('cancel on the deadline day itself still works', () => {
    const d = cancellationDeadline(contract(), '2027-01-28');
    expect(d.deadline).toBe('2027-01-28');
    expect(d.termEnd).toBe('2027-02-28');
  });

  it('cancelled contracts keep costing money until the term ends', () => {
    const cancelled = contract({ cancelledAt: '2025-06-01' });
    expect(countedMonthlyCost(cancelled, '2026-01-15')).toBe(20); // still in initial term
    expect(countedMonthlyCost(cancelled, '2027-03-01')).toBe(0); // term ended 28 Feb 2027
    expect(countedMonthlyCost(contract(), '2026-01-15')).toBe(20);
  });
});

describe('subscriptions', () => {
  const prime = (over: Partial<SubscriptionItem> = {}): SubscriptionItem => ({
    id: 's1', kind: 'subscription', title: 'Amazon Prime', category: 'Subscriptions',
    price: 89.90, currency: 'EUR', interval: 'year', firstChargeDate: '2025-01-10',
    attachments: [], priceHistory: [], createdAt: '2025-01-01', updatedAt: '2025-01-01', ...over
  });

  it('Amazon Prime at €89.90/year -> €7.49/month', () => {
    expect(toMonthly(89.90, 'year')).toBe(7.49);
    expect(monthlyCost(prime())).toBe(7.49);
    expect(round2(89.90 / 12)).toBe(7.49);
  });

  it('a yearly plan shows once as a renewal in the calendar year', () => {
    const dates = paymentDatesBetween(prime(), '2025-01-01', '2025-12-31');
    expect(dates).toEqual(['2025-01-10']);
    expect(paymentDatesBetween(prime(), '2026-01-01', '2026-12-31')).toEqual(['2026-01-10']);
  });

  it('monthly subscription charges every month; next charge on/after asOf', () => {
    const monthly = prime({ price: 9.99, interval: 'month', firstChargeDate: '2025-01-05' });
    expect(paymentDatesBetween(monthly, '2025-03-01', '2025-03-31')).toEqual(['2025-03-05']);
    expect(nextCharge(monthly, '2025-03-05')).toBe('2025-03-05');
    expect(nextCharge(monthly, '2025-03-06')).toBe('2025-04-05');
  });

  it('free trial: no charge before the trial ends', () => {
    const trial = prime({ trialEnds: '2025-03-15', firstChargeDate: '2025-03-15' });
    expect(nextCharge(trial, '2025-02-01')).toBe('2025-03-15');
  });
});

describe('purchases: return window, guarantee, warranty', () => {
  const purchase = (over: Partial<PurchaseItem> = {}): PurchaseItem => ({
    id: 'p1', kind: 'purchase', title: 'TV', category: 'Electronics',
    price: 500, currency: 'EUR', purchaseDate: '2025-05-10',
    returnWindowDays: 14, legalGuaranteeMonths: 24, warrantyMonths: 24,
    attachments: [], priceHistory: [], createdAt: '2025-05-10', updatedAt: '2025-05-10', ...over
  });

  it('return window is 14 days after purchase', () => {
    expect(returnWindowEnd(purchase())).toBe('2025-05-24');
    expect(claimStatus(purchase(), '2025-05-20')).toBe('return');
  });

  it('legal guarantee lasts 24 months', () => {
    expect(legalGuaranteeEnd(purchase())).toBe('2027-05-10');
    expect(claimStatus(purchase(), '2026-01-01')).toBe('legal-guarantee');
    expect(claimStatus(purchase(), '2028-01-01')).toBe('none');
  });
});

describe('cards and documents', () => {
  it('a card expiring "2026-11" is valid until 30 Nov 2026', () => {
    expect(cardValidUntil('2026-11')).toBe('2026-11-30');
    expect(cardValidUntil('2028-02')).toBe('2028-02-29'); // leap year
  });

  it('a document with month-only expiry is valid until end of that month', () => {
    const doc: DocumentItem = {
      id: 'd1', kind: 'document', title: 'Card', category: 'Other',
      expiryDate: '2026-11', expiryMonthOnly: true, remindDaysBefore: 30,
      attachments: [], priceHistory: [], createdAt: '2025-01-01', updatedAt: '2025-01-01'
    };
    expect(documentValidUntil(doc)).toBe('2026-11-30');
  });

  it('warns which items to update when a card expires', () => {
    const a = { id: '1', paymentMethodId: 'pm1' } as VaultItem;
    const b = { id: '2', paymentMethodId: 'pm2' } as VaultItem;
    const hits = itemsPaidWith([a, b], 'pm1');
    expect(hits.map(h => h.id)).toEqual(['1']);
  });
});

describe('overview totals', () => {
  it('fixed monthly cost sums subscriptions, contracts and installments', () => {
    const items: VaultItem[] = [
      { id: 's', kind: 'subscription', title: 'Prime', category: 'Subscriptions', price: 89.9, currency: 'EUR', interval: 'year', firstChargeDate: '2025-01-10', attachments: [], priceHistory: [], createdAt: '', updatedAt: '' } as SubscriptionItem,
      contract(),
      installment()
    ];
    expect(fixedMonthlyCost(items, '2025-06-01')).toBe(round2(7.49 + 20 + 50));
  });

  it('month spend includes one-off purchases and installment payments of that month', () => {
    const items: VaultItem[] = [
      { id: 'p', kind: 'purchase', title: 'TV', category: 'Electronics', price: 500, currency: 'EUR', purchaseDate: '2025-06-20', returnWindowDays: 14, legalGuaranteeMonths: 24, attachments: [], priceHistory: [], createdAt: '', updatedAt: '' } as PurchaseItem,
      installment()
    ];
    // June 2025: purchase 500 + one rate of 50 on 15 Jun
    expect(monthSpend(items, 2025, 5)).toBe(550);
    // October 2025: only the rate
    expect(monthSpend(items, 2025, 9)).toBe(50);
  });
});
