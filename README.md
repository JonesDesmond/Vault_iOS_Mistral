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
server.** Nothing was published anywhere; the GitHub Pages workflow in
`.github/workflows/pages.yml` only runs when you manually click "Run workflow".

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
