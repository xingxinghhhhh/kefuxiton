import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n12-release-rehearsal.json'), 'utf8'));
const rehearsal = readFileSync(resolve(root, 'scripts', 'run-release-rehearsal.mjs'), 'utf8');
const apiSmoke = readFileSync(resolve(root, 'tests', 'smoke', 'api-production.mjs'), 'utf8');
const e2eRunner = readFileSync(resolve(root, 'scripts', 'run-isolated-e2e.mjs'), 'utf8');
const fixture = readFileSync(resolve(root, 'tests', 'fixtures', 'release-rehearsal-published.md'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(cases.length >= 12, 'N12 eval must cover release, harness, rollback, and cleanup boundaries');
for (const category of ['isolated_schema', 'single_migration', 'published_fixture', 'production_denial', 'customer_smoke', 'test_harness', 'safe_summary', 'rollback', 'owned_cleanup', 'failure_codes', 'baseline_clean_worktree', 'baseline_failure_closed']) {
  assert(cases.some((testCase) => testCase.category === category), `N12 eval is missing ${category}`);
}
for (const value of ['release_rehearsal_', 'schema_create', 'migration', 'fixture_import', 'production_publish_guard', 'test_harness_api_smoke', 'test_harness_e2e', 'rollback_validation', 'CLEANUP_FAILED']) {
  assert(rehearsal.includes(value), `release rehearsal is missing ${value}`);
}
assert(rehearsal.includes('APP_ENV: \'production\'') && rehearsal.includes('STAFF_AUTH_MODE: \'deny\'') && rehearsal.includes('ALLOW_KNOWLEDGE_PUBLISH: \'0\''), 'production rehearsal must be deny-by-default');
assert(rehearsal.includes('delete productionEnvironment.AI_AGENT_TEST_STAFF_TOKEN') && rehearsal.includes('delete productionEnvironment.AI_AGENT_TEST_STAFF_ID'), 'production rehearsal must remove test credentials');
assert(rehearsal.includes('captureSummary') && rehearsal.includes('relationDigest') && !rehearsal.includes('rawContent'), 'rollback summary must be redacted');
assert(rehearsal.includes(`baselineCommit = process.env.REHEARSAL_BASELINE_COMMIT ?? 'a4645ab'`) && rehearsal.includes("git', ['worktree', 'add', '--detach'"), 'rollback must pin and verify the N12 baseline in a detached worktree');
assert(rehearsal.includes('baseline_worktree_cleanup') && rehearsal.includes('baseline_api_build') && rehearsal.includes('assertSummaryUnchanged(beforeRollback, afterRollback)'), 'baseline rollback must build, clean up, and compare the redacted digest');
assert(apiSmoke.includes('API_SMOKE_EXTERNAL_SCHEMA') && e2eRunner.includes('E2E_EXTERNAL_SCHEMA'), 'harnesses must support externally owned schemas');
assert(fixture.includes('sourceStatus: published') && fixture.includes('status: published'), 'fixture must be synthetic published knowledge');
assert(packageJson.scripts?.['test:release-rehearsal'] === 'node scripts/run-release-rehearsal.mjs', 'release rehearsal script entry is missing');

console.log(`N12 eval passed: ${cases.length} synthetic release rehearsal, production boundary, harness, detached baseline rollback, and cleanup cases`);
