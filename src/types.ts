export type ItemKind = 'purchase' | 'installment' | 'subscription' | 'contract' | 'document';

export type Interval = 'week' | 'month' | 'quarter' | 'year';

export interface AccountInfo {
  customerNumber?: string;
  contractNumber?: string;
  cancelUrl?: string;
  cancelEmail?: string;
  cancelPhone?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  thumb?: Blob;
}

export interface PricePoint {
  date: string; // ISO YYYY-MM-DD
  amount: number;
  currency: string;
  note?: string;
}

export interface BaseItem {
  id: string;
  kind: ItemKind;
  title: string;
  category: string;
  notes?: string;
  account?: AccountInfo;
  paymentMethodId?: string;
  attachments: Attachment[];
  priceHistory: PricePoint[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string; // ISO date; keeps costing money until paid period / term ends
  usageRating?: 'often' | 'sometimes' | 'rarely' | 'never';
}

export interface PurchaseItem extends BaseItem {
  kind: 'purchase';
  price: number;
  currency: string;
  purchaseDate: string;
  returnWindowDays: number; // default 14
  legalGuaranteeMonths: number; // default 24
  warrantyMonths?: number; // manufacturer warranty
  extendedWarrantyMonths?: number;
  serialNumber?: string;
  orderNumber?: string;
}

export interface InstallmentItem extends BaseItem {
  kind: 'installment';
  rateAmount: number;
  currency: string;
  interval: Interval;
  // Full plan:
  totalAmount?: number;
  firstPaymentDate?: string;
  // "What's left" entry:
  remainingAmount?: number;
  nextPaymentDate?: string;
}

export interface SubscriptionItem extends BaseItem {
  kind: 'subscription';
  price: number;
  currency: string;
  interval: Interval;
  firstChargeDate: string;
  trialEnds?: string;
  minTermMonths?: number;
}

export interface ContractItem extends BaseItem {
  kind: 'contract';
  price: number;
  currency: string;
  interval: Interval;
  startDate: string;
  minTermMonths: number;
  renewalPeriodMonths: number;
  noticePeriodMonths: number;
  firstChargeDate?: string;
}

export interface DocumentItem extends BaseItem {
  kind: 'document';
  expiryDate: string; // ISO date, or YYYY-MM for cards (valid until end of that month)
  expiryMonthOnly?: boolean;
  remindDaysBefore: number;
  repeatMonths?: number; // repeats every N months
  renewedAt?: string;
}

export type VaultItem = PurchaseItem | InstallmentItem | SubscriptionItem | ContractItem | DocumentItem;

export interface PaymentMethod {
  id: string;
  name: string;
  last4: string; // never a full number
  type: 'card' | 'bank' | 'cash' | 'other';
  expiryMonth?: string; // YYYY-MM for cards
}

export type LimitScope = 'all' | 'subscriptions' | 'contracts' | 'installments' | 'category';

export interface SpendingLimit {
  id: string;
  label: string;
  scope: LimitScope;
  category?: string;
  mode: 'fixed' | 'percentOfIncome';
  amount?: number; // fixed EUR amount
  percent?: number; // % of monthly income
}

export interface Settings {
  id: 'settings';
  monthlyIncome?: number;
  currency: string;
  limits: SpendingLimit[];
  lockEnabled: boolean;
  pinSalt?: string;
  pinHash?: string;
  webauthnCredentialId?: string; // base64url
  webauthnEnabled: boolean;
  theme: 'system' | 'light' | 'dark';
  lastBackupAt?: string;
}

export interface InboxFile {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  receivedAt: string;
  parsed?: ParsedReceipt;
  claimedItemId?: string;
}

export interface ParsedReceipt {
  store?: string;
  date?: string; // ISO
  total?: number;
  currency?: string;
}

export const CATEGORIES = [
  'Housing', 'Food', 'Transport', 'Health', 'Electronics', 'Clothing',
  'Subscriptions', 'Insurance', 'Travel', 'Education', 'Fitness', 'Other'
];
