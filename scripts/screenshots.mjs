// Captures real screenshots of the built app with headless Chromium (Playwright).
// Usage: npm run build && LD_LIBRARY_PATH=... npm run screenshots
// Requires the Chromium build: npx playwright install chromium
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'screenshots');
mkdirSync(outDir, { recursive: true });

const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}/Vault_iOS_Mistral/`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
  cwd: root, stdio: 'ignore'
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

const MOBILE = { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1 };

async function shot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  console.log('saved', name);
}

async function capture(browser, name, hash, opts, query = '?seed=1') {
  try {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(BASE + query + '#' + hash, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await shot(page, name);
    await ctx.close();
  } catch (e) {
    console.log('FAILED', name, String(e).split('\n')[0]);
  }
}

try {
  await waitForServer();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  await capture(browser, '01-overview-phone-light.png', '/overview', { viewport: MOBILE, colorScheme: 'light' });
  await capture(browser, '02-overview-phone-dark.png', '/overview', { viewport: MOBILE, colorScheme: 'dark' });
  await capture(browser, '03-calendar-phone.png', '/calendar', { viewport: MOBILE, colorScheme: 'light' });
  await capture(browser, '04-items-phone.png', '/items', { viewport: MOBILE, colorScheme: 'light' });
  await capture(browser, '05-item-detail-phone.png', '/item/ex-contract', { viewport: MOBILE, colorScheme: 'light' });
  await capture(browser, '06-new-item-phone.png', '/new/subscription', { viewport: MOBILE, colorScheme: 'light' });
  await capture(browser, '07-overview-desktop-dark.png', '/overview', { viewport: DESKTOP, colorScheme: 'dark' });
  await capture(browser, '08-settings-german-phone.png', '/settings', { viewport: MOBILE, colorScheme: 'light' }, '?seed=1&lang=de');
  await capture(browser, '09-calendar-desktop.png', '/calendar', { viewport: DESKTOP, colorScheme: 'light' });

  await browser.close();
  console.log('ALL-SCREENSHOTS-DONE');
} finally {
  server.kill();
}
