import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1, // one Chromium + one OS clipboard at a time
  reporter: 'list',
  webServer: { command: 'node scripts/serve-demo.mjs', url: 'http://127.0.0.1:4173/', reuseExistingServer: true },
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'e2e', testIgnore: /screenshots\.spec\.mjs$/ },
    { name: 'screenshots', testMatch: /screenshots\.spec\.mjs$/ },
  ],
});
