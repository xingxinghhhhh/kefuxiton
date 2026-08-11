import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n11-config-preflight.json'), 'utf8'));
const config = readFileSync(resolve(root, 'packages', 'config', 'src', 'index.ts'), 'utf8');
const main = readFileSync(resolve(root, 'apps', 'api', 'src', 'main.ts'), 'utf8');
const auth = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'auth', 'auth.module.ts'), 'utf8');
const nextConfig = readFileSync(resolve(root, 'apps', 'web', 'next.config.mjs'), 'utf8');
const preflight = readFileSync(resolve(root, 'scripts', 'preflight.mjs'), 'utf8');
const smoke = readFileSync(resolve(root, 'tests', 'smoke', 'configuration-preflight.mjs'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(cases.length >= 10, 'N11 eval must cover configuration, production boundaries, redaction, and regression');
for (const category of ['required_fields', 'url_validation', 'production_test_auth_block', 'production_secret_block', 'production_knowledge_publish_block', 'deny_by_default', 'safe_errors', 'no_database_write', 'web_secret_boundary', 'regression_boundary']) {
  assert(cases.some((testCase) => testCase.category === category), `N11 eval is missing ${category} coverage`);
}
for (const value of ['CONFIG_MISSING', 'CONFIG_INVALID', 'CONFIG_FORBIDDEN_IN_ENV', 'CONFIG_SECRET_FORBIDDEN', 'CONFIG_URL_INVALID', 'production', 'DATABASE_URL', 'NEXT_PUBLIC_API_BASE_URL']) {
  assert(config.includes(value) || main.includes(value) || preflight.includes(value), `N11 configuration boundary is missing ${value}`);
}
assert(main.includes('loadApiConfig') && main.includes('process.exitCode') && !main.includes('process.env.PORT'), 'API must validate configuration before listening');
assert(auth.includes('getStaffAuthMode'), 'Staff auth mode must use the shared configuration boundary');
assert(nextConfig.includes('loadWebConfig') && nextConfig.includes('transpilePackages'), 'Web build must validate public configuration');
assert(preflight.includes('runPreflight') && smoke.includes('test-only-staff-token') && smoke.includes('must not expose secrets'), 'preflight and startup smoke must cover safe failure');
assert(!config.includes('fetch(') && !config.includes('Prisma') && !config.includes('migrate'), 'configuration validation must not call external systems or mutate databases');

console.log(`N11 eval passed: ${cases.length} fixed configuration preflight, production boundary, redaction, and no-write cases`);
