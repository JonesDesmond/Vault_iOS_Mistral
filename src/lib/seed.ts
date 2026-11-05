// Example data that can be loaded and removed again. Ids carry the prefix "ex-".

import { db, uid } from '../db';
import type { VaultItem, PaymentMethod, Settings } from '../types';

export const EXAMPLE_PREFIX = 'ex-';

export async function loadExampleData(): Promise<void> {
  const methods: PaymentMethod[] = [
    { id: 'ex-pm-card', name: 'Visa card', last4: '4242', type: 'card', expiryMonth: '2027-08' },
    { id: 'ex-pm-bank', name: 'Girokonto (direct debit)', last4: '1010', type: 'bank' }
  ];
  const items: VaultItem[] = [
    {
      id: 'ex-purchase', kind: 'purchase', title: 'iPad Air 5', category: 'Electronics',
      price: 300, currency: 'EUR', purchaseDate: '2025-06-15', returnWindowDays: 14,
      legalGuaranteeMonths: 24, warrantyMonths: 12, serialNumber: 'DMX123456', orderNumber: 'A-987654',
      paymentMethodId: 'ex-pm-card', notes: 'Bought at the Apple Store',
      attachments: [], priceHistory: [{ date: '2025-06-15', amount: 300, currency: 'EUR' }],
      createdAt: '2025-06-15', updatedAt: '2025-06-15'
    },
    {
      id: 'ex-installment', kind: 'installment', title: 'iPad Air 5 installment plan', category: 'Electronics',
      rateAmount: 50, currency: 'EUR', interval: 'month', totalAmount: 300, firstPaymentDate: '2025-06-15',
      paymentMethodId: 'ex-pm-bank', attachments: [], priceHistory: [],
      createdAt: '2025-06-15', updatedAt: '2025-06-15'
    },
    {
      id: 'ex-sub', kind: 'subscription', title: 'Amazon Prime', category: 'Subscriptions',
      price: 89.90, currency: 'EUR', interval: 'year', firstChargeDate: '2025-01-10',
      paymentMethodId: 'ex-pm-card',
      account: { customerNumber: 'AMZ-555-111', cancelUrl: 'https://www.amazon.de/gp/primecentral' },
      attachments: [], priceHistory: [{ date: '2024-01-10', amount: 79.90, currency: 'EUR', note: 'price increase' }, { date: '2025-01-10', amount: 89.90, currency: 'EUR', note: 'price increase' }],
      createdAt: '2024-01-10', updatedAt: '2025-01-10'
    },
    {
      id: 'ex-contract', kind: 'contract', title: 'Mobile phone contract', category: 'Insurance',
      price: 20, currency: 'EUR', interval: 'month', startDate: '2025-03-01',
      minTermMonths: 24, renewalPeriodMonths: 1, noticePeriodMonths: 1, firstChargeDate: '2025-03-01',
      paymentMethodId: 'ex-pm-bank',
      account: { customerNumber: 'MC-123456', contractNumber: 'V-987654', cancelUrl: 'https://example-mobile.example/cancel', cancelEmail: 'kuendigung@example-mobile.example', cancelPhone: '+49 800 1234567' },
      attachments: [], priceHistory: [], createdAt: '2025-03-01', updatedAt: '2025-03-01'
    },
    {
      id: 'ex-doc', kind: 'document', title: 'Passport', category: 'Other',
      expiryDate: '2026-11', expiryMonthOnly: true, remindDaysBefore: 90, repeatMonths: 120,
      attachments: [], priceHistory: [], createdAt: '2025-01-01', updatedAt: '2025-01-01'
    }
  ];
  await db.transaction('rw', db.items, db.paymentMethods, db.settings, async () => {
    await db.paymentMethods.bulkPut(methods);
    await db.items.bulkPut(items);
    const s = await db.settings.get('settings');
    if (s && !s.monthlyIncome) await db.settings.put({ ...s, monthlyIncome: 2800 });
  });
}

export async function removeExampleData(): Promise<number> {
  const items = await db.items.where('id').startsWith(EXAMPLE_PREFIX).toArray();
  const ids = items.map(i => i.id);
  await db.transaction('rw', db.items, db.paymentMethods, async () => {
    await db.items.bulkDelete(ids);
    await db.paymentMethods.where('id').startsWith(EXAMPLE_PREFIX).delete();
  });
  return ids.length;
}

export async function hasExampleData(): Promise<boolean> {
  return (await db.items.where('id').startsWith(EXAMPLE_PREFIX).count()) > 0;
}

export function newId(prefix = ''): string {
  return prefix + uid();
}

export type { Settings };
