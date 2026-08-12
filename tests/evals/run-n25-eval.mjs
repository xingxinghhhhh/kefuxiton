import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n25-langgraph-evidence-gate.json'), 'utf8'));
const source = readFileSync(join(root, 'packages', 'langgraph-lab', 'src', 'gate-snapshot.ts'), 'utf8');
const bundleSource = readFileSync(join(root, 'packages', 'langgraph-lab', 'src', 'bundle-seal.ts'), 'utf8');
const tests = ['gate-snapshot.spec.ts', 'gate-snapshot-redaction.spec.ts', 'gate-snapshot-determinism.spec.ts', 'gate-snapshot-isolation.spec.ts']
  .map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'test', file), 'utf8'))
  .join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N25 eval failed: ${message}`);
}

assert(cases.length === 14, 'fixed N25 case count changed');
assert(cases.filter((testCase) => testCase.kind === 'valid').length === 1, 'valid N25 case count changed');
assert(cases.filter((testCase) => testCase.kind === 'invalid').length === 13, 'invalid N25 case count changed');
assert(new Set(cases.map((testCase) => testCase.id)).size === cases.length, 'N25 case ids must be unique');
assert(source.includes('EvidenceGateSnapshot') && source.includes('buildEvidenceGateSnapshot'), 'N25 snapshot contract is missing');
assert(source.includes('verifyEvidenceBundle(bundle, envelopes)'), 'N25 must reuse N23 verification');
assert(source.includes("status: 'passed'") && source.includes("status: 'blocked'"), 'N25 statuses are missing');
assert(source.includes("reasonCode: 'NONE'") && source.includes("'BUNDLE_INVALID'"), 'N25 fail-closed mapping is missing');
assert(source.includes('N23_CASE_COUNT') && source.includes('N23_SCHEMA_VERSION'), 'N23 fixed constants are missing');
assert(!source.includes('caseId'), 'N25 snapshot must not expose caseId');
assert(!source.includes('report') && !source.includes('actualSummary'), 'N25 snapshot source must not carry report content');
assert(!source.includes('n25.v1') && !source.includes('gate-summary'), 'N25 must not add a new schema or summary layer');
assert(tests.includes('Object.keys(snapshot)') && tests.includes('structuredClone'), 'N25 exact-key/isolation coverage is missing');
assert(tests.includes('BUNDLE_INVALID') && tests.includes('bundleDigest'), 'N25 failure/redaction coverage is missing');
assert(bundleSource.includes('verifyEvidenceBundle'), 'N23 verification source is missing');
assert(!source.includes('MemorySaver') && !source.includes('readFile') && !source.includes('writeFile'), 'N25 must not access state or files');
assert(!/from ['"]@nestjs\//u.test(source) && !/from ['"]@prisma\//u.test(source), 'N25 crossed into production infrastructure');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(source), 'N25 crossed into external model or tracing');

console.log(`N25 eval passed: ${cases.length} fixed read-only gate snapshot cases.`);
