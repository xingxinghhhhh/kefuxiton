import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n23-langgraph-evidence-bundle.json'), 'utf8'));
const sourceFiles = ['bundle-contract.ts', 'bundle-seal.ts'];
const source = sourceFiles.map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'src', file), 'utf8')).join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N23 eval failed: ${message}`);
}

assert(cases.length === 13, 'fixed bundle case count changed');
assert(cases.filter((testCase) => testCase.kind === 'valid').length === 1, 'valid bundle case count changed');
assert(cases.filter((testCase) => testCase.kind === 'invalid').length === 12, 'invalid bundle case count changed');
assert(new Set(cases.map((testCase) => testCase.id)).size === cases.length, 'bundle case ids must be unique');
assert(source.includes("N23_SCHEMA_VERSION = 'n23.v1'"), 'n23.v1 contract is missing');
assert(source.includes('EvidenceBundle') && source.includes('bundleDigest'), 'evidence bundle is missing');
assert(source.includes('N20_CASE_IDS') && source.includes('N23_CASE_COUNT = 13'), 'fixed N20 allowlist is missing');
assert(source.includes('createHash') && source.includes("'sha256'"), 'sha256 bundle sealing is missing');
assert(source.includes('sealEvidenceBundle') && source.includes('verifyEvidenceBundle'), 'bundle seal and verify APIs are missing');
assert(source.includes('hasExactKeys') && source.includes('SENSITIVE_DATA_REJECTED'), 'strict fail-closed bundle validation is missing');
assert(source.includes('N23_MAX_BUNDLE_BYTES') && source.includes('8 * 1024'), 'bundle size bound is missing');
assert(source.includes('CASE_MISSING') && source.includes('CASE_DUPLICATE') && source.includes('CASE_ORDER_INVALID') && source.includes('CASE_ID_MISMATCH'), 'case completeness checks are missing');
assert(!source.includes('runTracedN17Workflow') && !source.includes('createTracedHumanReviewSession'), 'bundle sealing must not rerun graphs');
assert(!source.includes('MemorySaver') && !source.includes('replay-fixtures'), 'bundle sealing must not access replay state or fixtures');
assert(!source.includes('fs.write') && !source.includes('writeFile') && !source.includes('DATABASE_URL'), 'bundle sealing must not persist or access environment state');
assert(!/from ['"]@nestjs\//u.test(source), 'NestJS import crossed into the lab');
assert(!/from ['"]@prisma\//u.test(source), 'Prisma import crossed into the lab');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(source), 'external model or tracing import crossed into the lab');

console.log(`N23 eval passed: ${cases.length} fixed multi-case bundle integrity cases and isolation checks.`);
