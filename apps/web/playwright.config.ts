import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '3001';
const webPort = process.env.E2E_WEB_PORT ?? '3000';
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? `http://127.0.0.1:${apiPort}/api/v1`;
const webOrigin = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: webOrigin, trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: [
    {
      command: 'pnpm --filter @ai-agent/api start',
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: true,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://ai_agent:ai_agent_dev_only@localhost:5432/ai_customer_service?schema=public',
        APP_ENV: 'test',
        PORT: apiPort,
        WEB_ORIGIN: webOrigin,
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
        STAFF_AUTH_MODE: 'test',
        ALLOW_KNOWLEDGE_PUBLISH: '0',
        AI_AGENT_TEST_STAFF_TOKEN: 'test-staff-token',
        AI_AGENT_TEST_STAFF_ID: 'test-operator',
      },
    },
    {
      command: `pnpm exec next dev -p ${webPort}`,
      url: `${webOrigin}/chat`,
      reuseExistingServer: true,
      env: { NEXT_PUBLIC_API_BASE_URL: apiBaseUrl, APP_ENV: 'test' },
    },
  ],
});
