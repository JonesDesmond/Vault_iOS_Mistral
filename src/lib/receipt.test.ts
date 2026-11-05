import { describe, it, expect } from 'vitest';
import { parseReceiptText, parseAmount, parseDateLine } from './receipt';

describe('parseAmount', () => {
  it('parses German and English formats', () => {
    expect(parseAmount('15,17')).toBe(15.17);
    expect(parseAmount('15.17')).toBe(15.17);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('1.234')).toBe(1234);
    expect(parseAmount('0,99')).toBe(0.99);
  });
});

describe('parseReceiptText', () => {
  it('reads "SUMME EUR 15,17" as total €15.17', () => {
    const r = parseReceiptText(['REWE Markt GmbH', 'Datum: 05.03.2025', 'SUMME EUR 15,17'].join('\n'));
    expect(r.total).toBe(15.17);
    expect(r.currency).toBe('EUR');
    expect(r.date).toBe('2025-03-05');
    expect(r.store).toBe('REWE Markt GmbH');
  });

  it('never takes subtotal, VAT or change as the total', () => {
    const text = [
      'EDEKA',
      'Datum 12.06.2025 18:42',
      '2x Milch        2,58',
      'SUBTOTAL        EUR 12,28',
      'MWST 7%         EUR 0,86',
      'MWST 19%        EUR 2,03',
      'SUMME           EUR 15,17',
      'BAR             EUR 20,00',
      'WECHSELGELD     EUR 4,83'
    ].join('\n');
    const r = parseReceiptText(text);
    expect(r.total).toBe(15.17);
    expect(r.date).toBe('2025-06-12');
  });

  it('English receipts: TOTAL, USD, day-first dates still read European', () => {
    const r = parseReceiptText(['Corner Shop', 'Date: 03/15/2025', 'VAT 8.25%  USD 1.24', 'TOTAL USD 16.24'].join('\n'));
    expect(r.total).toBe(16.24);
    expect(r.currency).toBe('USD');
  });

  it('reads dates day-first (European)', () => {
    expect(parseDateLine('Datum: 05.03.2025')).toBe('2025-03-05');
    expect(parseDateLine('15/03/2025')).toBe('2025-03-15');
    expect(parseDateLine('2025-03-05')).toBe('2025-03-05');
    expect(parseDateLine('31.12.2026')).toBe('2026-12-31');
  });

  it('handles German umlauts and store names', () => {
    const r = parseReceiptText(['Bäckerei Müller GmbH', '05.11.2025', 'GESAMT 8,40 €'].join('\n'));
    expect(r.total).toBe(8.4);
    expect(r.currency).toBe('EUR');
    expect(r.store).toBe('Bäckerei Müller GmbH');
  });

  it('returns empty result for garbage', () => {
    const r = parseReceiptText('...\n---\n');
    expect(r.total).toBeUndefined();
  });
});
