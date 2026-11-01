import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 3,
  timeout: 30000,
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', browserName: 'chromium' },
  projects: [
    {
      name: 'desktop',
      testMatch: 'workspace.spec.js',
      use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile',
      testMatch: 'workspace.spec.js',
      use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'small-mobile',
      testMatch: 'workspace.spec.js',
      use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'authenticated',
      testMatch: 'auth.spec.js',
      use: {
        baseURL: 'http://127.0.0.1:4174',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'iphone-webkit',
      testMatch: 'workspace.spec.js',
      use: { ...devices['iPhone 13'], browserName: 'webkit', baseURL: 'http://127.0.0.1:4173' },
    },
    { name: 'setup', testMatch: 'setup.spec.js', use: { baseURL: 'http://127.0.0.1:4176' } },
  ],
  webServer: [
    {
      command: 'npm run dev:client -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      },
    },
    {
      command: 'npm run dev:client -- --host 127.0.0.1 --port 4176 --strictPort',
      url: 'http://127.0.0.1:4176',
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    },
    {
      command: 'npm run dev:client -- --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      },
    },
  ],
})
