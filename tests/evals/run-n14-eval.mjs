import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  canonicalizeBusinessInputPackage,
  evaluateBusinessReadiness,
  loadBusinessInputPackage,
  normalizeKnowledgeMarkdown,
} from '../../packages/config/dist/index.js';
import { parseKnowledgeMarkdown } from '../../apps/api/dist/modules/knowledge/markdown-knowledge.js';

const root = resolve(import.meta.dirname, '..', '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'config/business-readiness/synthetic-local-eval.json'), 'utf8'));
const fixturePath = resolve(root, 'apps/api/src/modules/knowledge/fixtures/it-service-desk.local-eval.md');
const fixture = readFileSync(fixturePath, 'utf8');
const parsed = parseKnowledgeMarkdown(fixture);
const packageInput = loadBusinessInputPackage(manifest);
const canonicalSha256 = createHash('sha256').update(canonicalizeBusinessInputPackage(packageInput), 'utf8').digest('hex');
const now = new Date('2026-08-11T00:00:00.000Z');

function hashKnowledgeMarkdown(markdown) {
  return createHash('sha256').update(normalizeKnowledgeMarkdown(markdown), 'utf8').digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.packageId === 'SYNTHETIC-IT-SERVICE-DESK-001', 'confirmed packageId must be used');
assert(manifest.packageVersion === 'synthetic-v1', 'confirmed packageVersion must be used');
assert(packageInput.knowledgeSource.sourceId === parsed.sourceId, 'sourceId must match fixture front matter');
assert(packageInput.knowledgeSource.sourceRef === parsed.sourceRef, 'sourceRef must match fixture front matter');
assert(packageInput.knowledgeSource.sourceStatus === parsed.sourceStatus, 'sourceStatus must match fixture front matter');
assert(packageInput.knowledgeSource.sourceStatus === parsed.status, 'fixture status must match source status');
assert(packageInput.knowledgeSource.documentVersion === parsed.version, 'documentVersion must match fixture version');
assert(packageInput.packageVersion === parsed.version, 'packageVersion must match fixture version');
assert(packageInput.knowledgeSource.contentSha256 === hashKnowledgeMarkdown(fixture), 'manifest content hash must match normalized fixture');

const localReport = evaluateBusinessReadiness(packageInput, 'local_eval', {
  canonicalSha256,
  sourceContentSha256: hashKnowledgeMarkdown(fixture),
  now,
});
assert(localReport.status === 'LOCAL_EVAL_READY' && localReport.reasonCodes.length === 0, 'aligned synthetic package must be local_eval ready');

const productionReport = evaluateBusinessReadiness(packageInput, 'production', {
  canonicalSha256,
  sourceContentSha256: hashKnowledgeMarkdown(fixture),
  now,
});
assert(productionReport.status === 'NOT_READY', 'synthetic package must remain production blocked');
assert(productionReport.reasonCodes.includes('SOURCE_NOT_APPROVED'), 'production gate must require approved source');
assert(productionReport.reasonCodes.includes('SYNTHETIC_NOT_PRODUCTION'), 'production gate must reject synthetic input');

const mismatch = spawnSync(process.execPath, [
  resolve(root, 'apps/api/scripts/knowledge/import-markdown.mjs'),
  resolve(root, 'tests/fixtures/release-rehearsal-published.md'),
  '--status=published',
  '--readiness-manifest=config/business-readiness/synthetic-local-eval.json',
  '--readiness-target=local_eval',
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    APP_ENV: 'test',
    ALLOW_KNOWLEDGE_PUBLISH: '1',
    STAFF_AUTH_MODE: 'deny',
    DATABASE_URL: 'not-a-url',
  },
});
const mismatchOutput = `${mismatch.stdout}\n${mismatch.stderr}`;
assert(mismatch.status !== 0 && mismatchOutput.includes('IDENTITY_NOT_READY'), 'manifest/fixture identity mismatch must fail before database access');
assert(!mismatchOutput.includes('Environment variable not found'), 'identity mismatch must fail before Prisma configuration');

const cases = JSON.parse(readFileSync(resolve(root, 'tests/evals/n14-business-readiness.json'), 'utf8'));
assert(cases.length === 4, 'N14 eval must contain the fixed contract cases');
console.log(`N14 eval passed: ${cases.length} identity, hash, local_eval, production-gate, and pre-write rejection cases`);
