import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n21-langgraph-replay-diagnostics.json'), 'utf8'));
const sourceFiles = ['replay-diagnostic-contract.ts', 'replay-diagnostics.ts'];
const source = sourceFiles.map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'src', file), 'utf8')).join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N21 eval failed: ${message}`);
}

const expectedKinds = new Set([
  ...Array.from({ length: 13 }, () => 'none'),
  'golden_mismatch',
  'non_deterministic',
  'request_rejected',
  'fixture_rejected',
  'sensitive_output_rejected',
  'internal_failure',
]);

assert(cases.length === 21, 'fixed diagnostic case count changed');
assert(cases.filter((testCase) => testCase.expectedKind === 'none').length === 13, 'passed case count changed');
assert(new Set(cases.map((testCase) => testCase.id)).size === cases.length, 'diagnostic case ids must be unique');
for (const testCase of cases) assert(expectedKinds.has(testCase.expectedKind), `unexpected diagnostic kind ${testCase.expectedKind}`);

assert(source.includes("N21_SCHEMA_VERSION = 'n21.v1'"), 'n21.v1 contract is missing');
assert(source.includes('diagnoseReplayResult') && source.includes('N21_MAX_REPORT_BYTES'), 'diagnostic mapper or report bound is missing');
assert(source.includes('sensitive_output_rejected') && source.includes('non_deterministic'), 'diagnostic security classes are missing');
assert(source.includes('hasExactKeys') && source.includes('SENSITIVE_DATA_REJECTED'), 'strict fail-closed validation is missing');
assert(source.includes('TextEncoder') && source.includes('16 * 1024'), 'report size bound is missing');
assert(!source.includes('runTracedN17Workflow') && !source.includes('createTracedHumanReviewSession'), 'diagnostic mapper must not rerun graphs');
assert(!source.includes('MemorySaver') && !source.includes('replay-fixtures'), 'diagnostic mapper must not access replay state or fixtures');
assert(!/from ['"]@nestjs\//u.test(source), 'NestJS import crossed into the lab');
assert(!/from ['"]@prisma\//u.test(source), 'Prisma import crossed into the lab');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(source), 'external model or tracing import crossed into the lab');
assert(!source.includes('traceId') && !source.includes('threadId') && !source.includes('checkpoint'), 'runtime identity or checkpoint leaked into diagnostic source');

console.log(`N21 eval passed: ${cases.length} fixed diagnostic cases and isolation checks.`);
