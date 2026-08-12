import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n24-langgraph-evidence-bundle.json'), 'utf8'));
const sourceFiles = ['bundle-contract.ts', 'bundle-seal.ts'];
const source = sourceFiles.map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'src', file), 'utf8')).join('\n');
const testFiles = ['bundle-determinism.spec.ts', 'bundle-compatibility.spec.ts', 'bundle-mutation-isolation.spec.ts', 'bundle-regression.spec.ts'];
const tests = testFiles.map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'test', file), 'utf8')).join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N24 eval failed: ${message}`);
}

assert(cases.length === 16, 'fixed N24 case count changed');
assert(cases.filter((testCase) => testCase.kind === 'valid').length === 8, 'valid N24 case count changed');
assert(cases.filter((testCase) => testCase.kind === 'invalid').length === 8, 'invalid N24 case count changed');
assert(new Set(cases.map((testCase) => testCase.id)).size === cases.length, 'N24 case ids must be unique');
assert(source.includes("N23_SCHEMA_VERSION = 'n23.v1'"), 'N23 contract regression is missing');
assert(source.includes('sealEvidenceBundle') && source.includes('verifyEvidenceBundle'), 'N23 APIs are missing');
assert(source.includes('createHash') && source.includes("'sha256'"), 'canonical digest implementation is missing');
assert(source.includes('N23_SOURCE_SCHEMA_VERSION') && source.includes('N23_DIGEST_ALGORITHM'), 'version compatibility checks are missing');
assert(!source.includes('n24.v1'), 'N24 must not introduce a new evidence schema');
assert(tests.includes('structuredClone') && tests.includes('CASE_ORDER_INVALID'), 'mutation/order regression coverage is missing');
assert(tests.includes('SOURCE_VERSION_UNSUPPORTED') && tests.includes('DIGEST_ALGORITHM_UNSUPPORTED'), 'compatibility matrix coverage is missing');
assert(tests.includes('BUNDLE_DIGEST_MISMATCH') && tests.includes('ENVELOPE_TAMPERED'), 'tamper regression coverage is missing');
assert(!source.includes('runTracedN17Workflow') && !source.includes('createTracedHumanReviewSession'), 'N24 must not rerun graphs');
assert(!source.includes('MemorySaver') && !source.includes('replay-fixtures'), 'N24 must not access replay state or fixtures');
assert(!source.includes('writeFile') && !source.includes('DATABASE_URL'), 'N24 must not persist or access environment state');
assert(!/from ['"]@nestjs\//u.test(source), 'NestJS import crossed into the lab');
assert(!/from ['"]@prisma\//u.test(source), 'Prisma import crossed into the lab');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(source), 'external model or tracing import crossed into the lab');

console.log(`N24 eval passed: ${cases.length} fixed determinism, mutation-isolation, compatibility, and regression cases.`);
