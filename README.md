# 🧾 Receipt Vault

An app that keeps track of everything you pay for — purchases (receipts & warranties),
subscriptions, contracts, installment plans and documents that expire. It shows your
monthly spending, warns you before deadlines, and helps you act (cancel, claim, renew).

**Everything stays on your device. No server, no account, no tracking.**

## The technology, in plain language

- **React + TypeScript + Vite** — a modern way to build a website-like app ("web app")
  that you can also install on your phone and PC like a normal app (that's the "PWA").
- **IndexedDB via Dexie** — your data lives in a small database inside your browser,
  on your device only.
- **Tesseract OCR, bundled inside the app** — receipt scanning (German + English) runs
  100% on your device. The engine (worker, WASM core, language files) ships inside
  `public/ocr/` and is only ever loaded from the app's own address — never from a CDN
  or any outside server.
- **Service worker** — makes the app work offline and handles "share to app" from
  other apps (photos/PDFs land in the Inbox).
- All money and date calculations live in pure functions (`src/lib/calc.ts`,
  `src/lib/receipt.ts`) with automated tests (`npm run test`).

## What went online while building this

Only package downloads from the public npm registry were needed: `npm install`
(React, Dexie, tesseract.js, the Excel library, build tools) and the tesseract
OCR engine files (WASM core + German/English language data), which are now bundled
in this repository under `public/ocr/`. **The finished app itself contacts no outside
server — the only exception is the optional AI scanning mode, which sends the photo
to the provider you explicitly configure and enable.** Nothing was published anywhere;
the GitHub Pages workflow in `.github/workflows/pages.yml` only runs when you manually
click "Run workflow".

## Run it on Windows 11

You need [Node.js](https://nodejs.org) (LTS) installed. Then, in PowerShell inside
this folder:

```powershell
npm install
```

```powershell
npm run dev
```

Open http://localhost:5173/Vault_iOS_Mistral/ in your browser.

Checks (one per block):

```powershell
npm run test
```

```powershell
npm run typecheck
```

```powershell
npm run build
```

```powershell
npm run preview
```

then open http://localhost:4173/Vault_iOS_Mistral/ to test the production build.

## Phases and what to test

1. **Core + calculations** — `npm run test` runs 26 tests, including the required
   examples (iPad installment math, contract cancellation deadline, Prime €89.90/yr →
   €7.49/mo, receipt "SUMME EUR 15,17" → €15.17, card expiring 2026-11 → valid until
   30 Nov 2026).
2. **Overview & items** — load example data in Settings, watch the tiles, 12-month
   chart with limit line, category breakdown, 90-day deadlines. Add/edit an item;
   photos are shrunk on-device before saving.
3. **Calendar** — month grid (weeks start Monday), tap a day, month list with the
   month's total, filters, Today button, ← → arrow keys, "Export .ics".
4. **Inbox & scanning** — snap/share a receipt photo → Inbox → "Scan receipt
   (on-device)" → store/date/total/currency pre-filled → create the purchase with the
   photo attached. **To prove no outside server is contacted:** open DevTools (F12) →
   Network tab → run a scan → you will see requests only to your own address
   (localhost, or your GitHub Pages address later), e.g. `/ocr/...`.
5. **Assistants** — "Write cancellation" (earliest end date, deadline, customer number,
   direct-debit revocation for bank payments) and "Something's wrong with it"
   (return window / legal guarantee / warranty, claim letter). Copy or open in your
   own email app — the app never sends anything. Letters carry a "not legal advice" note.
6. **Review** — rate subscriptions (often → never), see yearly savings; year in review.
7. **Settings** — spending limits (fixed or % of income, warnings at 70/80/90/100%),
   payment methods (name + last 4 only), app lock (PIN + fingerprint/Face ID as a
   privacy screen), backups (plain or AES-256-encrypted), Excel/CSV export,
   "keep data permanently", example data.

## Test it on an iPhone 6s (or any iPhone/iPad, iOS 12+)

A true App Store `.ipa` would need an Apple Developer account and publishing — which your
privacy rules forbid — so on iOS the app runs as an **installed home-screen web app (PWA)**,
which on a 6s works fully offline. The build targets ES2017 and falls back to pure-JS crypto
where iOS lacks WebCrypto (plain http), so it runs on iOS 15.8 (the 6s maximum) and newer.

On your Windows PC, serve the app on your Wi-Fi network:

```powershell
npm run dev -- --host
```

Then on the iPhone 6s (same Wi-Fi): open Safari and go to
`http://<your-PC's-LAN-IP>:5173/Vault_iOS_Mistral/` (the IP is shown in the PowerShell output).
Tap **Share → Add to Home Screen** — the app icon appears and opens fullscreen.

What to expect on a 6s:

- Everything works: items, calendar, limits, assistants, backup, PIN lock.
- Receipt OCR runs on-device but is slower on the A9 chip (allow ~10–30 s per photo).
- iOS does not support the "share from other apps into the app" target — use the 📷 button in the Inbox instead.
- Face ID / Touch ID unlock needs iOS 16.4+, so on a 6s the PIN lock is used.
- "Keep data permanently" is supported on iOS from version 17; on iOS 15 the button explains this.
- Encrypted backups (AES-256-GCM) work even over plain http thanks to the bundled pure-JS fallback.

## Optional AI receipt scanning (off by default)

Settings → **AI receipt scanning (optional)**. Choose a provider: **Mistral AI**,
**ChatGPT (OpenAI)**, **Claude (Anthropic)**, **Gemini (Google)**, or **your own local
AI server** (Ollama `http://<pc>:11434` or LM Studio `http://localhost:1234`, vision model
e.g. `llava`). Enter the model and API key (stored only in this device's local database).

- **Off by default.** On-device Tesseract OCR remains the standard and never uploads anything.
- When enabled, the Inbox shows an extra "✨ Scan with AI" button that asks for confirmation
  every time: the photo is then sent **only** to the endpoint you configured. `src/lib/ai.ts`
  is the only module in the app that can build an external URL; its request builders and
  response parsing are covered by automated tests (`src/lib/ai.test.ts`).

## Languages

Settings → **Language**: English, Deutsch, Français, Italiano, Ελληνικά.
(Or append `?lang=de` to the URL once.) Untranslated strings fall back to English.

## Screenshots

Real screenshots of the app (captured headless at phone width 375px and desktop, light and dark):

- [Overview, phone, light](docs/screenshots/01-overview-phone-light.png)
- [Overview, phone, dark](docs/screenshots/02-overview-phone-dark.png)
- [Calendar, phone](docs/screenshots/03-calendar-phone.png)
- [Items list, phone](docs/screenshots/04-items-phone.png)
- [Item detail, phone](docs/screenshots/05-item-detail-phone.png)
- [New item form, phone](docs/screenshots/06-new-item-phone.png)
- [Overview, desktop, dark](docs/screenshots/07-overview-desktop-dark.png)
- [Settings in German, phone](docs/screenshots/08-settings-german-phone.png)
- [Calendar, desktop](docs/screenshots/09-calendar-desktop.png)

Regenerate them yourself: `npm run build && npm run screenshots`
(needs `npx playwright install chromium` once).

## Native iOS app (Xcode project, ready to build on a Mac)

The same code is wrapped as a native iOS app with Capacitor (the `ios/` folder is generated and committed).
On a Mac with Xcode installed:

```bash
npm install
```

```bash
npm run ios
```

```bash
npm run ios:open
```

Then in Xcode: select your iPhone as the run destination and press Run (▶). Testing on your own
device with a free personal Apple ID is possible — only App Store distribution needs the paid
$99/year developer program, which we are not using.

## Later: free hosting (not published)

`.github/workflows/pages.yml` is prepared for GitHub Pages but is **manual-only**
(`workflow_dispatch`) — pushing code publishes nothing. When you want it online:
GitHub → repo → Settings → Pages → Source: "GitHub Actions", then Actions → run the
workflow once. The app would then live at
`https://jonesdesmond.github.io/Vault_iOS_Mistral/` and be installable on your phone.

## Privacy rules baked in

- No server, no account, no analytics, no CDN at runtime.
- Payment methods store only a name + last 4 digits.
- Receipt photos/PDFs are stored locally; large photos are shrunk on-device.
- Backups are local files; encrypted backups use AES-256-GCM with your password.
- Urgency is always shown with an icon **and** words, never by color alone.
