// Parse OCR text from a receipt photo into store / date / total / currency.
// German and English receipts. Pure functions — fully unit-tested.

import type { ParsedReceipt } from '../types';
import { toISODate } from './dates';

/** Parse a money amount that may be German (1.234,56 / 15,17) or English (1,234.56 / 15.17). */
export function parseAmount(raw: string): number | null {
  const m = raw.replace(/\s/g, '').match(/\d[\d.,]*\d|\d/);
  if (!m) return null;
  let s = m[0];
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // the separator that appears last is the decimal separator
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.234 -> 1234
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const STRONG_TOTAL = /\b(summe|gesamtbetrag|gesamt|endbetrag|total|amount due|to pay)\b/i;
const WEAK_TOTAL = /\b(betrag|amount|zu zahlen|payable|charge)\b/i;
const NOT_TOTAL = /\b(mwst|ust|vat|steuer|tax|subtotal|sub-total|zwischensumme|change|wechselgeld|r(ü|ue)ckgeld|rabatt|discount|tendered|given|cash)\b/i;
const CURRENCY_PATTERNS: [RegExp, string][] = [
  [/\bEUR\b|\beuro?s?\b|€/i, 'EUR'],
  [/\bUSD\b|\$/i, 'USD'],
  [/\bGBP\b|£/i, 'GBP'],
  [/\bCHF\b/i, 'CHF'],
  [/\bPLN\b|zł/i, 'PLN']
];

/** Day-first (European) date: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, or ISO YYYY-MM-DD. */
export function parseDateLine(line: string): string | null {
  let m = line.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const [, y, mo, d] = m;
    if (valid(+mo, +d)) return toISODate(new Date(+y, +mo - 1, +d));
  }
  m = line.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/);
  if (m) {
    let [, d, mo, y] = m;
    let yy = +y;
    if (yy < 100) yy += 2000;
    if (valid(+mo, +d)) return toISODate(new Date(yy, +mo - 1, +d)); // day first
  }
  return null;
}

function valid(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const result: ParsedReceipt = {};

  // Total: the LAST line with a strong total keyword and an amount.
  // Subtotal / VAT / change lines are never the total.
  let totalLine: string | undefined;
  for (const line of lines) {
    if (NOT_TOTAL.test(line) && !STRONG_TOTAL.test(line)) continue;
    if ((STRONG_TOTAL.test(line) || WEAK_TOTAL.test(line)) && parseAmount(line) != null) {
      totalLine = line;
    }
  }
  if (totalLine) {
    const amount = parseAmount(totalLine);
    if (amount != null) result.total = Math.round(amount * 100) / 100;
    for (const [re, code] of CURRENCY_PATTERNS) {
      if (re.test(totalLine)) { result.currency = code; break; }
    }
  }
  if (!result.currency) {
    for (const line of lines) {
      for (const [re, code] of CURRENCY_PATTERNS) {
        if (re.test(line)) { result.currency = code; break; }
      }
      if (result.currency) break;
    }
  }

  // Date: prefer lines mentioning date/datum; day-first European format.
  const dateLines = lines.filter(l => /\b(datum|date|den|am)\b/i.test(l));
  const pool = dateLines.length > 0 ? dateLines : lines;
  for (const line of pool) {
    const d = parseDateLine(line);
    if (d) { result.date = d; break; }
  }

  // Store: first line with letters, not a date/amount/total line.
  for (const line of lines) {
    if (parseDateLine(line)) continue;
    if (STRONG_TOTAL.test(line) || WEAK_TOTAL.test(line) || NOT_TOTAL.test(line)) continue;
    if (!/[A-Za-zÄÖÜäöüß]{3,}/.test(line)) continue;
    const cleaned = line.replace(/[#*]{2,}/g, '').trim();
    if (cleaned.length >= 3 && cleaned.length <= 48) { result.store = cleaned; break; }
  }

  return result;
}
