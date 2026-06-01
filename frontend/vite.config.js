import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

// Bake the repo-root VERSION into the bundle at build time so the running app
// always reports the build it was compiled from. Self-host rebuilds dist on
// every deploy, so this stays accurate.
const __dirname = dirname(fileURLToPath(import.meta.url))
let appVersion = '0.0.0.0'
try {
  appVersion = readFileSync(resolve(__dirname, '../VERSION'), 'utf8').trim()
} catch {
  // VERSION missing (e.g. partial checkout) — fall back to placeholder.
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
