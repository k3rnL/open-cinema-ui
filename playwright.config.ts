import { defineConfig } from '@playwright/test'

const releaseBuild = Boolean(process.env.RELEASE_ADMIN_DIR && process.env.RELEASE_UI_DIR)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  timeout: 30_000,
  expect: {timeout: 5_000},
  use: {
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: releaseBuild ? {
    command: 'node scripts/serve-release.mjs',
    url: 'http://127.0.0.1:4175/admin/',
    reuseExistingServer: false,
    timeout: 30_000,
  } : [
    {
      command: 'npm run dev --workspace=apps/admin -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173/admin/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev --workspace=apps/ui -- --host 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174/ui/',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
