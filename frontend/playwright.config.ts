import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests (Task 8c). One command from the frontend folder:  npm run e2e
 *
 * It starts its own backend (a throw-away database called alankar_e2e, never your real one)
 * and its own frontend on port 5174, runs the tests, and stops both.
 * Set E2E_USE_RUNNING=1 with E2E_BASE_URL to test servers you started yourself.
 */
const python = process.env.E2E_PYTHON || 'python';
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';
const useRunning = process.env.E2E_USE_RUNNING === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: useRunning
    ? undefined
    : [
        {
          // Builds the test database (refuses any name not ending in _e2e), then serves the API.
          command: `${python} manage.py e2e_prepare && ${python} manage.py runserver 127.0.0.1:8001 --noreload`,
          cwd: '../backend',
          url: 'http://127.0.0.1:8001/api/health/',
          timeout: 240_000,
          reuseExistingServer: false,
          env: {
            ...(process.env as Record<string, string>),
            SALON_DB_NAME: 'alankar_e2e',
            SALON_DEBUG: 'true',
            SALON_CUSTOMER_OTP: 'false',
            SALON_FRONTEND_URL: 'http://127.0.0.1:5174',
            // The test signs in many times from one address; lift the limits for the test server.
            SALON_AUTH_RATE: '1000/min',
            SALON_BOOKING_RATE: '1000/min',
            SALON_ANON_RATE: '5000/min',
            SALON_USER_RATE: '5000/min',
            SALON_PUBLIC_WRITE_RATE: '1000/min',
          },
        },
        {
          command: 'npx vite --port 5174 --host 127.0.0.1 --strictPort',
          url: 'http://127.0.0.1:5174',
          timeout: 120_000,
          reuseExistingServer: false,
          env: {
            ...(process.env as Record<string, string>),
            VITE_API_PROXY_TARGET: 'http://127.0.0.1:8001',
          },
        },
      ],
});
