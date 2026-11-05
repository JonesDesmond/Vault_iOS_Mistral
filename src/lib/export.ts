// Excel (.xlsx) and CSV export of all items. Uses the bundled SheetJS library (local, no CDN).

import * as XLSX from 'xlsx';
import type { VaultItem } from '../types';
import { monthlyCost, installmentStatus, cancellationDeadline, nextCharge, documentValidUntil } from './calc';
import { todayISO } from './dates';
import { downloadBlob } from './backup';

function rowsOf(items: VaultItem[]) {
  return items.map(i => {
    const base: Record<string, string | number> = {
      id: i.id, kind: i.kind, title: i.title, category: i.category, notes: i.notes ?? '',
      monthly_cost_eur: monthlyCost(i), next_charge: (() => { try { return nextCharge(i, todayISO()) ?? ''; } catch { return ''; } })(),
      cancelled: i.cancelledAt ?? '',
      customer_number: i.account?.customerNumber ?? '',
      contract_number: i.account?.contractNumber ?? '',
      cancel_url: i.account?.cancelUrl ?? '',
      cancel_email: i.account?.cancelEmail ?? '',
      cancel_phone: i.account?.cancelPhone ?? ''
    };
    if (i.kind === 'purchase') {
      base.price = i.price; base.currency = i.currency; base.purchase_date = i.purchaseDate;
      base.serial = i.serialNumber ?? ''; base.order_number = i.orderNumber ?? '';
    } else if (i.kind === 'installment') {
      const s = installmentStatus(i, todayISO());
      base.rate = i.rateAmount; base.interval = i.interval;
      base.remaining = s.remaining; base.payments_left = s.paymentsLeft; base.payoff_date = s.payoffDate ?? '';
    } else if (i.kind === 'subscription') {
      base.price = i.price; base.interval = i.interval; base.first_charge = i.firstChargeDate; base.trial_ends = i.trialEnds ?? '';
    } else if (i.kind === 'contract') {
      base.price = i.price; base.start = i.startDate; base.min_term_months = i.minTermMonths;
      base.renewal_months = i.renewalPeriodMonths; base.notice_months = i.noticePeriodMonths;
      const d = cancellationDeadline(i, todayISO());
      base.cancel_by = d.deadline; base.term_ends = d.termEnd;
    } else if (i.kind === 'document') {
      base.valid_until = documentValidUntil(i); base.remind_days_before = i.remindDaysBefore;
      base.repeats_months = i.repeatMonths ?? '';
    }
    return base;
  });
}

export function exportXLSX(items: VaultItem[]): void {
  const ws = XLSX.utils.json_to_sheet(rowsOf(items));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Items');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'receipt-vault.xlsx');
}

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCSV(items: VaultItem[]): void {
  const rows = rowsOf(items);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(';'), ...rows.map(r => headers.map(h => csvCell(r[h])).join(';'))];
  downloadBlob(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), 'receipt-vault.csv');
}
