import Dexie, { type Table } from 'dexie';
import type { VaultItem, PaymentMethod, Settings, InboxFile } from './types';

export class VaultDB extends Dexie {
  items!: Table<VaultItem, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  settings!: Table<Settings, string>;
  inbox!: Table<InboxFile, string>;

  constructor() {
    super('receipt-vault');
    this.version(1).stores({
      items: 'id, kind, category, cancelledAt, purchaseDate, firstChargeDate, startDate, expiryDate, paymentMethodId, updatedAt',
      paymentMethods: 'id, type',
      settings: 'id',
      inbox: 'id, receivedAt, claimedItemId'
    });
  }
}

export const db = new VaultDB();

export async function getSettings(): Promise<Settings> {
  let s = await db.settings.get('settings');
  if (!s) {
    s = {
      id: 'settings',
      currency: 'EUR',
      limits: [],
      lockEnabled: false,
      webauthnEnabled: false,
      theme: 'system'
    };
    await db.settings.put(s);
  }
  return s;
}

export function uid(): string {
  return crypto.randomUUID();
}
