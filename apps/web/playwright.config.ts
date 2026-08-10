import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: [
    {
      command: 'pnpm --filter @ai-agent/api start',
      url: 'http://127.0.0.1:3001/api/v1/health',
      reuseExistingServer: true,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://ai_agent:ai_agent_dev_only@localhost:5432/ai_customer_service?schema=public',
        PORT: '3001',
        WEB_ORIGIN: 'http://127.0.0.1:3000',
        STAFF_AUTH_MODE: 'test',
        AI_AGENT_TEST_STAFF_TOKEN: 'test-staff-token',
        AI_AGENT_TEST_STAFF_ID: 'test-operator',
      },
    },
    { command: 'pnpm --filter @ai-agent/web dev', url: 'http://127.0.0.1:3000/chat', reuseExistingServer: true },
  ],
});
