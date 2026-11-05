import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from './db';
import { collectSharedFiles } from './lib/share';
import { webauthnAvailable, unlockWithWebAuthn } from './lib/webauthn';
import Overview from './screens/Overview';
import CalendarScreen from './screens/Calendar';
import Items from './screens/Items';
import ItemForm from './screens/ItemForm';
import Inbox from './screens/Inbox';
import Assistants from './screens/Assistants';
import Review from './screens/Review';
import SettingsScreen from './screens/Settings';

export interface Route { name: string; id?: string; kind?: string; }

export function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [name, a, b] = h.split('/');
  if (name === 'item' && a) return { name: 'item', id: a };
  if (name === 'edit' && a) return { name: 'edit', id: a };
  if (name === 'new' && a) return { name: 'new', kind: a };
  if (name === 'assistant' && a) return { name: 'assistant', id: a };
  return { name: name || 'overview' };
}

export function go(r: Route): void {
  const h = r.name === 'item' ? `#/item/${r.id}` : r.name === 'edit' ? `#/edit/${r.id}` : r.name === 'new' ? `#/new/${r.kind}` : r.name === 'assistant' ? `#/assistant/${r.id}` : `#/${r.name}`;
  window.location.hash = h;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function LockScreen({ settings, onUnlock }: { settings: Awaited<ReturnType<typeof getSettings>>; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    webauthnAvailable().then(ok => setBioAvailable(ok && settings.webauthnEnabled && !!settings.webauthnCredentialId));
  }, [settings]);

  const submit = async () => {
    if (!settings.pinSalt || !settings.pinHash) return onUnlock();
    const hash = await sha256Hex(settings.pinSalt + ':' + pin);
    if (hash === settings.pinHash) {
      sessionStorage.setItem('rv-unlocked', '1');
      onUnlock();
    } else {
      setError('Wrong PIN. Try again.');
      setPin('');
    }
  };

  return (
    <div className="lockscreen">
      <div className="lock-card">
        <div className="lock-icon" aria-hidden>🔒</div>
        <h1>Receipt Vault</h1>
        <p>Enter your PIN to unlock. Everything stays on this device.</p>
        <input
          type="password" inputMode="numeric" autoFocus
          value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="PIN"
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" onClick={submit}>Unlock</button>
        {bioAvailable && (
          <button className="btn" onClick={async () => {
            try {
              if (await unlockWithWebAuthn(settings.webauthnCredentialId!)) {
                sessionStorage.setItem('rv-unlocked', '1');
                onUnlock();
              } else setError('Fingerprint / Face ID not recognised.');
            } catch { setError('Fingerprint / Face ID not recognised.'); }
          }}>👆 Unlock with fingerprint / Face ID</button>
        )}
      </div>
    </div>
  );
}

const NAV = [
  { name: 'overview', icon: '🏠', label: 'Overview' },
  { name: 'calendar', icon: '📅', label: 'Calendar' },
  { name: 'items', icon: '🧾', label: 'Items' },
  { name: 'inbox', icon: '📥', label: 'Inbox' },
  { name: 'assistants', icon: '🤖', label: 'Assistants' },
  { name: 'review', icon: '📊', label: 'Review' },
  { name: 'settings', icon: '⚙️', label: 'Settings' }
];

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash());
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem('rv-unlocked') === '1');
  const settings = useLiveQuery(() => getSettings());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (window.location.hash.includes('shared=1')) {
      collectSharedFiles().then(() => {
        window.location.hash = '#/inbox';
      });
    }
    if ('storage' in navigator && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!settings) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings]);

  const content = useMemo(() => {
    switch (route.name) {
      case 'calendar': return <CalendarScreen />;
      case 'items': return <Items />;
      case 'item': return <Items detailId={route.id} />;
      case 'new': return <ItemForm kind={route.kind as any} />;
      case 'edit': return <ItemForm editId={route.id} />;
      case 'inbox': return <Inbox />;
      case 'assistants': return <Assistants />;
      case 'assistant': return <Assistants itemId={route.id} />;
      case 'review': return <Review />;
      case 'settings': return <SettingsScreen />;
      default: return <Overview />;
    }
  }, [route]);

  if (settings && settings.lockEnabled && !unlocked) {
    return <LockScreen settings={settings} onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">🧾 Receipt Vault</span>
        <nav className="nav">
          {NAV.map(n => (
            <a key={n.name} href={`#/${n.name}`} className={route.name === n.name ? 'active' : ''}>
              <span aria-hidden>{n.icon}</span> {n.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="content">{content}</main>
    </div>
  );
}
