import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {createReleaseMetadata} from '../../scripts/vite-release'

const release = createReleaseMetadata('admin', 'apps/admin')

export default defineConfig({
  define: release.define,
  plugins: [react(), release.plugin],
  server: {
    port: 3000,
    host: true, // Expose to network for admin panel
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
    },
  },
  base: process.env.VITE_BASE_PATH || '/admin/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@open-cinema/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
})
