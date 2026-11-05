// Export calendar events as .ics (iCalendar) so they can be imported into any calendar app.

import type { CalEvent } from './events';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function dt(dateISO: string): string {
  return dateISO.replace(/-/g, '');
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function toICS(events: CalEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Receipt Vault//EN',
    'CALSCALE:GREGORIAN'
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.itemId}-${e.date}-${e.kind}@receipt-vault`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${dt(e.date)}`,
      `SUMMARY:${esc(e.title)}`,
      `CATEGORIES:${esc(e.kind.toUpperCase())}`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function downloadICS(events: CalEvent[], filename = 'receipt-vault.ics'): void {
  const blob = new Blob([toICS(events)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
