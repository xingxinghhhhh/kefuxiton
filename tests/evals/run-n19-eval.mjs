import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n19-langgraph-trace.json'), 'utf8'));
const sourceFiles = [
  'trace-contract.ts',
  'trace-recorder.ts',
  'graph.ts',
  'hitl-graph.ts',
  'hitl-resume.ts',
  'traced-n17.ts',
  'traced-n18.ts',
];
const source = sourceFiles.map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'src', file), 'utf8')).join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N19 eval failed: ${message}`);
}

const expectedCases = new Set([
  'n17_normal_trace',
  'n17_injection_trace',
  'n17_no_match_trace',
  'n17_unsafe_knowledge_trace',
  'n17_retrieval_failure_trace',
  'n18_initial_pause_trace',
  'n18_approve_trace',
  'n18_deny_trace',
  'n18_missing_trace',
  'n18_invalid_trace',
  'n18_duplicate_trace',
  'n18_stale_trace',
  'trace_redaction_and_determinism',
]);

assert(cases.length === expectedCases.size, 'fixed case count changed');
for (const testCase of cases) {
  assert(expectedCases.has(testCase.id), `unexpected case ${testCase.id}`);
  assert(typeof testCase.graph === 'string', `${testCase.id} has no graph label`);
}

assert(source.includes("N19_SCHEMA_VERSION = 'n19.v1'"), 'n19.v1 contract is missing');
assert(source.includes('class TraceRecorder'), 'TraceRecorder is missing');
assert(source.includes('recordNodeEntered') && source.includes('recordNodeCompleted'), 'node lifecycle recording is missing');
assert(source.includes('createTracedHumanReviewSession') && source.includes('runTracedN17Workflow'), 'traced runners are missing');
assert(source.includes('TraceSink'), 'explicit trace sink boundary is missing');
assert(source.includes('MemorySaver'), 'N18 MemorySaver boundary is not visible');
assert(!source.includes('streamEvents'), 'raw LangGraph stream events must not be the audit source');
assert(!source.includes('Date.now') && !source.includes('Math.random') && !source.includes('randomUUID'), 'trace must not use runtime nondeterminism');
assert(!source.includes('process.cwd') && !source.includes('JSON.stringify(state'), 'trace must not serialize runtime state or paths');
assert(!/from ['"]@nestjs\//u.test(source), 'NestJS import crossed into the lab');
assert(!/from ['"]@prisma\//u.test(source), 'Prisma import crossed into the lab');
assert(!/from ['"].*agent\.port/u.test(source), 'production AgentPort import crossed into the lab');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(source), 'external model or tracing import crossed into the lab');

console.log(`N19 eval passed: ${cases.length} fixed trace/redaction cases and isolation checks.`);
