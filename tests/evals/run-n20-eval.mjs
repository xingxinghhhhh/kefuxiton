import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n20-langgraph-replay.json'), 'utf8'));
const sourceFiles = [
  'replay-contract.ts',
  'replay-runner.ts',
  'traced-n17.ts',
  'traced-n18.ts',
  'trace-contract.ts',
];
const source = sourceFiles.map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'src', file), 'utf8')).join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N20 eval failed: ${message}`);
}

const expectedCases = new Set([
  'n17-normal',
  'n17-injection',
  'n17-no-match',
  'n17-unsafe-knowledge',
  'n17-retrieval-failure',
  'n17-invalid-retrieval',
  'n18-handoff-pause',
  'n18-approve',
  'n18-deny',
  'n18-missing',
  'n18-invalid',
  'n18-duplicate',
  'n18-stale',
]);

assert(cases.length === expectedCases.size, 'fixed case count changed');
for (const testCase of cases) {
  assert(expectedCases.has(testCase.id), `unexpected case ${testCase.id}`);
  assert(testCase.graph === 'n17' || testCase.graph === 'n18', `${testCase.id} has invalid graph label`);
}

assert(source.includes("N20_SCHEMA_VERSION = 'n20.v1'"), 'n20.v1 contract is missing');
assert(source.includes('ReplayFixtureRegistry') && source.includes('descriptorHash'), 'controlled fixture registry boundary is missing');
assert(source.includes('matchesGolden') && source.includes('matchesSecondRun') && source.includes('firstMismatchIndex'), 'determinism report is incomplete');
assert(source.includes('TRACE_MISMATCH') && source.includes('REPLAY_NON_DETERMINISTIC'), 'fail-closed replay errors are missing');
assert(source.includes('createTracedHumanReviewSession') && source.includes('runTracedN17Workflow'), 'N17/N18 traced replay runners are missing');
assert(source.includes('MemorySaver'), 'N18 in-memory replay boundary is missing');
assert(!source.includes("replay-fixtures"), 'production replay source must not import test fixtures');
assert(!source.includes('Date.now') && !source.includes('Math.random') && !source.includes('randomUUID'), 'replay must not use runtime nondeterminism');
assert(!source.includes('JSON.stringify') && !source.includes('process.cwd'), 'replay must not serialize runtime state or local paths');
assert(!/from ['"]@nestjs\//u.test(source), 'NestJS import crossed into the lab');
assert(!/from ['"]@prisma\//u.test(source), 'Prisma import crossed into the lab');
assert(!/from ['"].*agent\.port/u.test(source), 'production AgentPort import crossed into the lab');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(source), 'external model or tracing import crossed into the lab');

console.log(`N20 eval passed: ${cases.length} fixed replay/determinism cases and isolation checks.`);
