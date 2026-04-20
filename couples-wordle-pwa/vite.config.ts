import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Build-time version stamp — lets client_errors rows tie back to a
// specific bundle. Uses the git short sha when available (via execFile,
// no shell), else an ISO timestamp.
import { execFileSync } from 'node:child_process';
function resolveAppVersion(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
  } catch {
    return new Date().toISOString();
  }
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(resolveAppVersion())
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg', 'favicon-32.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']
      },
      devOptions: {
        enabled: false,
        type: 'module'
      },
      manifest: {
        name: 'Couples Wordle',
        short_name: 'CoupleWordle',
        description: 'Daily Wordle-style ritual for couples.',
        theme_color: '#3A5A40',
        background_color: '#F1F2EC',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: {
    port: 5173
  }
});
