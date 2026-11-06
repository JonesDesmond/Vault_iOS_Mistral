import type { ReactNode } from 'react';
import { t } from '../lib/i18n';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn icon" onClick={onClose} aria-label={t('Close')}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className={`tile ${tone ? `tile-${tone}` : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

const KIND_ICONS: Record<string, string> = { purchase: '🛍', installment: '💳', subscription: '🔁', contract: '📄', document: '🪪' };

export function kindLabel(kind: string): string {
  return `${KIND_ICONS[kind] ?? '🧾'} ${t({ purchase: 'Purchase', installment: 'Installment', subscription: 'Subscription', contract: 'Contract', document: 'Document' }[kind] ?? kind)}`;
}
