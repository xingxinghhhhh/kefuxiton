import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n22-langgraph-evidence.json'), 'utf8'));
const sourceFiles = ['evidence-contract.ts', 'evidence-seal.ts'];
const source = sourceFiles.map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'src', file), 'utf8')).join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N22 eval failed: ${message}`);
}

assert(cases.length === 26, 'fixed evidence case count changed');
assert(cases.filter((testCase) => testCase.kind === 'valid').length === 21, 'valid evidence case count changed');
assert(cases.filter((testCase) => testCase.kind === 'invalid').length === 5, 'invalid evidence case count changed');
assert(new Set(cases.map((testCase) => testCase.id)).size === cases.length, 'evidence case ids must be unique');
assert(source.includes("N22_SCHEMA_VERSION = 'n22.v1'"), 'n22.v1 contract is missing');
assert(source.includes('EvidenceEnvelope') && source.includes('evidenceDigest'), 'evidence envelope is missing');
assert(source.includes('createHash') && source.includes("'sha256'"), 'sha256 sealing is missing');
assert(source.includes('verifyEvidenceEnvelope') && source.includes('DIGEST_MISMATCH'), 'verification and tamper detection are missing');
assert(source.includes('hasExactKeys') && source.includes('SENSITIVE_DATA_REJECTED'), 'strict fail-closed validation is missing');
assert(source.includes('N22_MAX_ENVELOPE_BYTES') && source.includes('20 * 1024'), 'envelope size bound is missing');
assert(!source.includes('runTracedN17Workflow') && !source.includes('createTracedHumanReviewSession'), 'evidence sealing must not rerun graphs');
assert(!source.includes('MemorySaver') && !source.includes('replay-fixtures'), 'evidence sealing must not access replay state or fixtures');
assert(!source.includes('fs.write') && !source.includes('writeFile') && !source.includes('DATABASE_URL'), 'evidence sealing must not persist or access environment state');
assert(!/from ['"]@nestjs\//u.test(source), 'NestJS import crossed into the lab');
assert(!/from ['"]@prisma\//u.test(source), 'Prisma import crossed into the lab');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(source), 'external model or tracing import crossed into the lab');

console.log(`N22 eval passed: ${cases.length} fixed evidence seal/verification cases and isolation checks.`);
