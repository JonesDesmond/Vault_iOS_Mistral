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

const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  currency: 'EUR',
  language: 'en',
  limits: [],
  lockEnabled: false,
  webauthnEnabled: false,
  theme: 'system'
};

// Read-only: safe to call inside useLiveQuery (Dexie forbids writes in live queries).
export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
}

// Creates the settings row if missing. Call once on app start, outside live queries.
export async function ensureSettings(): Promise<void> {
  if (!(await db.settings.get('settings'))) await db.settings.put({ ...DEFAULT_SETTINGS });
}

export { uid } from './lib/compat';
