import { ConfigValidationError, formatConfigIssues, runPreflight, validateRuntimeConfig } from '@ai-agent/config';

const validTestEnvironment = {
  APP_ENV: 'test',
  PORT: '3001',
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://test-user:test-password@localhost:5432/test-db?schema=test',
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
  STAFF_AUTH_MODE: 'test',
  AI_AGENT_TEST_STAFF_TOKEN: 'test-only-staff-token',
  ALLOW_KNOWLEDGE_PUBLISH: '0',
};

describe('runtime configuration boundary', () => {
  it('loads a complete synthetic test configuration', () => {
    const config = validateRuntimeConfig(validTestEnvironment, { target: 'preflight', strict: true });
    expect(config).toMatchObject({ appEnv: 'test', port: 3001, staffAuthMode: 'test', allowKnowledgePublish: false });
  });

  it('accepts API runtime defaults without weakening database validation', () => {
    const config = validateRuntimeConfig({ DATABASE_URL: validTestEnvironment.DATABASE_URL }, { target: 'api' });
    expect(config).toMatchObject({ appEnv: 'development', port: 3001, webOrigin: 'http://localhost:3000', staffAuthMode: 'deny' });
  });

  it('reports missing and invalid fields without exposing values', () => {
    expect(() => validateRuntimeConfig({ APP_ENV: 'test', DATABASE_URL: 'not-a-url' }, { target: 'preflight', strict: true })).toThrow(ConfigValidationError);
    try {
      validateRuntimeConfig({ APP_ENV: 'test', DATABASE_URL: 'postgresql://secret-user:secret-password@localhost:5432/test-db' }, { target: 'preflight', strict: true });
      throw new Error('expected validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const message = formatConfigIssues(error as ConfigValidationError);
      expect(message).toContain('CONFIG_MISSING field=WEB_ORIGIN');
      expect(message).not.toContain('secret-password');
      expect(message).not.toContain('postgresql://');
    }
  });

  it('rejects test-only capabilities in production', () => {
    const result = runPreflight({
      ...validTestEnvironment,
      APP_ENV: 'production',
      WEB_ORIGIN: 'https://support.example.test',
      NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v1',
      STAFF_AUTH_MODE: 'test',
      ALLOW_KNOWLEDGE_PUBLISH: '1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        { code: 'CONFIG_FORBIDDEN_IN_ENV', field: 'STAFF_AUTH_MODE' },
        { code: 'CONFIG_SECRET_FORBIDDEN', field: 'AI_AGENT_TEST_STAFF_TOKEN' },
        { code: 'CONFIG_FORBIDDEN_IN_ENV', field: 'ALLOW_KNOWLEDGE_PUBLISH' },
      ]));
    }
  });

  it('rejects a public API URL that contains credentials or an unsafe origin', () => {
    const result = runPreflight({
      ...validTestEnvironment,
      NEXT_PUBLIC_API_BASE_URL: 'http://user:password@localhost:3001/api/v1',
      WEB_ORIGIN: 'http://remote.example.test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['CONFIG_URL_INVALID', 'CONFIG_FORBIDDEN_IN_ENV']));
  });
});
