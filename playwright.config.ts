import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'yarn next dev -p 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      MATRIX_BETA_ACCESS_MODE: 'controlled',
      MATRIX_BETA_ALLOWED_EMAILS: 'invited@example.com',
    },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
