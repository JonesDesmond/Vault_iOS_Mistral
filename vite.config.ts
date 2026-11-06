import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site for JonesDesmond/Vault_iOS_Mistral (override with VAULT_BASE).
// The native iOS/Android app (Capacitor) builds with the default base '/'.
// Nothing is published automatically: the Pages workflow is manual-only (workflow_dispatch).
const base = process.env.VAULT_BASE ?? '/Vault_iOS_Mistral/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'ocr/**/*'],
      manifest: {
        id: base,
        name: 'Receipt Vault',
        short_name: 'Receipt Vault',
        description: 'Keeps track of purchases, subscriptions, contracts, installments and expiring documents. 100% on-device.',
        lang: 'en',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#4f46e5',
        categories: ['finance', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        share_target: {
          action: `${base}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              { name: 'media', accept: ['image/*', 'application/pdf'] }
            ]
          }
        }
      },
      workbox: {
        // The bundled OCR engine (~13 MB) is cached at runtime on first scan (same-origin),
        // not precached up-front, so the app install stays light and still works offline after that.
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.origin === self.location.origin && url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-engine',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,wasm,gz}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024
      },
      devOptions: { enabled: false }
    })
  ],
  // es2017 so the built app also runs on iPhone 6s (iOS 15.8, older WebKit/JSCore).
  esbuild: { target: 'es2017' },
  optimizeDeps: { esbuildOptions: { target: 'es2017' } },
  build: {
    target: 'es2017',
    chunkSizeWarningLimit: 1600
  }
});
