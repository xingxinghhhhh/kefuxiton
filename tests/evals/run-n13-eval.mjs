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

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests/evals/n13-business-readiness.json'), 'utf8'));
const raw = JSON.parse(readFileSync(resolve(root, 'config/business-readiness/synthetic-local-eval.json'), 'utf8'));
const base = loadBusinessInputPackage(raw);
const sourceContent = readFileSync(resolve(root, base.knowledgeSource.sourceFile), 'utf8');
const sourceContentSha256 = createHash('sha256').update(normalizeKnowledgeMarkdown(sourceContent), 'utf8').digest('hex');
const now = new Date('2026-08-11T00:00:00.000Z');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function withCanonicalHash(value) {
  const packageInput = loadBusinessInputPackage(value);
  return { packageInput, canonicalSha256: sha256(canonicalizeBusinessInputPackage(packageInput)) };
}

function evaluate(value, target = 'local_eval', canonicalSha256 = undefined) {
  const loaded = withCanonicalHash(value);
  return evaluateBusinessReadiness(loaded.packageInput, target, {
    canonicalSha256: canonicalSha256 ?? loaded.canonicalSha256,
    sourceContentSha256: loaded.packageInput.knowledgeSource.sourceFile ? sourceContentSha256 : undefined,
    now,
  });
}

const valid = evaluate(raw);
assert(valid.status === 'LOCAL_EVAL_READY' && valid.reasonCodes.length === 0, 'valid local_eval package must be ready');

const missingConfirmation = structuredClone(raw);
delete missingConfirmation.accountability.confirmationRef;
const missingReport = evaluateBusinessReadiness(missingConfirmation, 'local_eval', { canonicalSha256: null, now });
assert(missingReport.reasonCodes.includes('MISSING_FIELD'), 'missing confirmation must fail with MISSING_FIELD');

const invalidState = structuredClone(raw);
invalidState.packageStatus = 'unknown';
const invalidReport = evaluateBusinessReadiness(invalidState, 'local_eval', { canonicalSha256: null, now });
assert(invalidReport.reasonCodes.includes('INVALID_FIELD'), 'invalid state must fail with INVALID_FIELD');

const unconfirmed = structuredClone(raw);
unconfirmed.packageStatus = 'pending_confirmation';
const unconfirmedReport = evaluate(unconfirmed);
assert(unconfirmedReport.reasonCodes.includes('NOT_CONFIRMED'), 'pending confirmation must fail with NOT_CONFIRMED');

const future = structuredClone(raw);
future.effectiveAt = '2027-01-01T00:00:00.000Z';
const futureReport = evaluate(future);
assert(futureReport.reasonCodes.includes('EFFECTIVE_DATE_NOT_REACHED'), 'future effectiveAt must fail');

const expired = structuredClone(raw);
expired.expiresAt = '2026-01-01T00:00:00.000Z';
const expiredReport = evaluate(expired);
assert(expiredReport.reasonCodes.includes('EXPIRED'), 'expired package must fail');

const hashMismatch = evaluate(raw, 'local_eval', '0000000000000000000000000000000000000000000000000000000000000000');
assert(hashMismatch.reasonCodes.includes('HASH_MISMATCH'), 'hash mismatch must fail');

const syntheticProduction = evaluate(raw, 'production');
assert(syntheticProduction.status === 'NOT_READY' && syntheticProduction.reasonCodes.includes('SYNTHETIC_NOT_PRODUCTION'), 'synthetic package must never be production ready');

const realOne = structuredClone(raw);
realOne.packageId = 'FORMAL_IT_SERVICE_DESK_001';
realOne.packageVersion = '1.0.0';
realOne.synthetic = false;
realOne.knowledgeSource.sourceStatus = 'published';
realOne.accountability.confirmationMethod = 'business_confirmation';
delete realOne.knowledgeSource.sourceFile;
const realOneLoaded = withCanonicalHash(realOne);
const realTwo = structuredClone(realOne);
realTwo.packageId = 'FORMAL_IT_SERVICE_DESK_002';
realTwo.packageVersion = '2.0.0';
const realTwoLoaded = withCanonicalHash(realTwo);
const conflictReport = evaluateBusinessReadiness(realOneLoaded.packageInput, 'production', {
  canonicalSha256: realOneLoaded.canonicalSha256,
  now,
  activePackages: [realOneLoaded.packageInput, realTwoLoaded.packageInput],
});
assert(conflictReport.reasonCodes.includes('CONFLICTING_ACTIVE_VERSION'), 'active version conflict must fail closed');

const reordered = Object.fromEntries(Object.entries(raw).reverse());
const reorderedLoaded = withCanonicalHash(reordered);
assert(reorderedLoaded.canonicalSha256 === withCanonicalHash(raw).canonicalSha256, 'canonical hash must be stable across key order');

const publishAttempt = spawnSync(process.execPath, [
  resolve(root, 'apps/api/scripts/knowledge/import-markdown.mjs'),
  resolve(root, 'tests/fixtures/release-rehearsal-published.md'),
  '--status=published',
  '--readiness-manifest=config/business-readiness/synthetic-local-eval.json',
  '--readiness-target=production',
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
const publishOutput = `${publishAttempt.stdout}\n${publishAttempt.stderr}`;
assert(publishAttempt.status !== 0 && publishOutput.includes('SYNTHETIC_NOT_PRODUCTION'), 'production publish must fail at readiness gate');
assert(!publishOutput.includes('Environment variable not found'), 'production publish must fail before database configuration');

assert(cases.length >= 11, 'N13 eval must contain the required readiness cases');
console.log(`N13 eval passed: ${cases.length} business input, readiness, hash, conflict, and pre-write gate cases`);
