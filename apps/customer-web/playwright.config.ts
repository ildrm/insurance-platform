import { defineConfig, devices } from '@playwright/test';

// Failure aria snapshots may otherwise record filled password values.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: '../../artifacts/customer-web/test-results',
  reporter: [['list'], ['html', { outputFolder: '../../artifacts/customer-web/report', open: 'never' }]],
  use: {
    baseURL: process.env.CUSTOMER_WEB_ORIGIN || 'http://127.0.0.1:3100',
    timezoneId: 'Asia/Tehran',
    actionTimeout: 15_000,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure',
    // Login passwords and the HttpOnly session cookie must not end up in trace archives.
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
