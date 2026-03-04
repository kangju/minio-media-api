import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  retries: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.PW_BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'e2e',
      testIgnore: ['**/bulk-upload.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e-bulk-upload',
      testMatch: ['**/bulk-upload.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
