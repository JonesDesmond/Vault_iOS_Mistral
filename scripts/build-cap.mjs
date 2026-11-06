// Builds the web app with base '/' for the native Capacitor shells (iOS/Android),
// where assets are served from capacitor://localhost (or https://localhost on Android).
import { spawnSync } from 'node:child_process';

process.env.VAULT_BASE = '/';
const r = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
