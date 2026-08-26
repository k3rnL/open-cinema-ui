import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {createReleaseMetadata} from '../../scripts/vite-release'

const release = createReleaseMetadata('on-box', 'apps/ui')

export default defineConfig({
  define: release.define,
  plugins: [react(), release.plugin],
  server: {
    port: 3001,
    host: true,
  },
  base: process.env.VITE_BASE_PATH || '/ui/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@open-cinema/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
})
