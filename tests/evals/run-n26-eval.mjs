import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n26-langgraph-evidence-gate-replay.json'), 'utf8'));
const source = readFileSync(join(root, 'packages', 'langgraph-lab', 'src', 'gate-snapshot.ts'), 'utf8');
const inputSource = readFileSync(join(root, 'packages', 'langgraph-lab', 'test', 'gate-replay-inputs.ts'), 'utf8');
const tests = ['gate-replay.spec.ts', 'gate-version-regression.spec.ts', 'gate-replay-isolation.spec.ts']
  .map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'test', file), 'utf8'))
  .join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N26 eval failed: ${message}`);
}

assert(cases.length === 22, 'fixed N26 case count changed');
assert(cases.filter((testCase) => testCase.kind === 'replay').length === 14, 'N26 replay case count changed');
assert(cases.filter((testCase) => testCase.kind === 'regression').length === 8, 'N26 regression case count changed');
assert(new Set(cases.map((testCase) => testCase.id)).size === cases.length, 'N26 case ids must be unique');
assert(inputSource.includes('N26_SCENARIO_IDS') && inputSource.includes('createN26ReplayInput'), 'fixed replay input registry is missing');
assert(inputSource.includes('makeEvidenceBundle') && inputSource.includes('makeEvidenceEnvelopes'), 'N25 controlled in-memory inputs are missing');
assert(tests.includes('canonicalSnapshot') && tests.includes('structuredClone'), 'N26 determinism/isolation coverage is missing');
assert(tests.includes('N23_REASON_CODES') && tests.includes('BUNDLE_INVALID'), 'N26 version/failure regression coverage is missing');
assert(source.includes('buildEvidenceGateSnapshot') && source.includes('verifyEvidenceBundle'), 'N25 builder/verifier contract is missing');
assert(!inputSource.includes('replay-fixtures') && !inputSource.includes('runTracedN17Workflow'), 'N26 must not access replay runner or fixture registry');
assert(!inputSource.includes('MemorySaver') && !inputSource.includes('writeFile') && !inputSource.includes('readFile'), 'N26 must remain in memory');
assert(!source.includes('n26.v1'), 'N26 must not introduce a runtime schema');
assert(!/from ['"]@nestjs\//u.test(inputSource) && !/from ['"]@prisma\//u.test(inputSource), 'N26 crossed into production infrastructure');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(inputSource), 'N26 crossed into external model or tracing');

console.log(`N26 eval passed: ${cases.length} fixed replay and version regression cases.`);
