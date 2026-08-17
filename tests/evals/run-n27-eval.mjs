import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n27-langgraph-evidence-chain.json'), 'utf8'));
const fixture = readFileSync(join(root, 'packages', 'langgraph-lab', 'test', 'evidence-chain-fixtures.ts'), 'utf8');
const tests = ['evidence-chain.spec.ts', 'evidence-chain-tamper.spec.ts', 'evidence-chain-replay.spec.ts']
  .map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'test', file), 'utf8'))
  .join('\n');
const source = readFileSync(join(root, 'packages', 'langgraph-lab', 'src', 'gate-snapshot.ts'), 'utf8');
const bundleSource = readFileSync(join(root, 'packages', 'langgraph-lab', 'src', 'bundle-seal.ts'), 'utf8');
const evidenceSource = readFileSync(join(root, 'packages', 'langgraph-lab', 'src', 'evidence-seal.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`N27 eval failed: ${message}`);
}

assert(cases.length === 18, 'fixed N27 case count changed');
assert(cases.filter((testCase) => testCase.kind === 'chain').length === 13, 'N27 chain case count changed');
assert(cases.filter((testCase) => testCase.kind === 'replay').length === 1, 'N27 replay case count changed');
assert(cases.filter((testCase) => testCase.kind === 'tamper').length === 4, 'N27 tamper case count changed');
assert(new Set(cases.map((testCase) => testCase.id)).size === cases.length, 'N27 case ids must be unique');
assert(fixture.includes('N20_CASE_IDS') && fixture.includes('makeEvidenceEnvelopes') && fixture.includes('makeEvidenceBundle'), 'N27 synthetic fixture reuse is missing');
assert(fixture.includes('createN27EvidenceChainInput') && fixture.includes('createN27TamperedInput'), 'N27 fixture constructors are missing');
assert(tests.includes('verifyEvidenceEnvelope') && tests.includes('sealEvidenceBundle') && tests.includes('verifyEvidenceBundle'), 'N22/N23 chain verification is missing');
assert(tests.includes('buildEvidenceGateSnapshot') && tests.includes('createN26ReplayInput'), 'N25/N26 consistency reuse is missing');
assert(tests.includes('structuredClone') && tests.includes('tamper-envelope-digest') && tests.includes('tamper-case-order'), 'N27 isolation/tamper coverage is missing');
assert(source.includes('verifyEvidenceBundle') && source.includes('buildEvidenceGateSnapshot'), 'N25 source contract is missing');
assert(bundleSource.includes('verifyEvidenceEnvelope') && evidenceSource.includes('evidenceDigest'), 'N22/N23 digest source contract is missing');
assert(!fixture.includes('runTracedN17Workflow') && !fixture.includes('MemorySaver') && !fixture.includes('readFile'), 'N27 must not run or read external replay state');
assert(!tests.includes('runTracedN17Workflow') && !tests.includes('MemorySaver') && !tests.includes('readFile'), 'N27 tests must remain offline and in memory');
assert(!fixture.includes('n27.v1') && !tests.includes('n27.v1') && !source.includes('n27.v1'), 'N27 must not add a runtime schema');
assert(!/from ['"]@nestjs\//u.test(fixture + tests) && !/from ['"]@prisma\//u.test(fixture + tests), 'N27 crossed into production infrastructure');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(fixture + tests), 'N27 crossed into external model or tracing');

console.log(`N27 eval passed: ${cases.length} fixed evidence-chain consistency cases.`);
