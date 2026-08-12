import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n18-langgraph-human-review.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(join(root, 'packages', 'langgraph-lab', 'package.json'), 'utf8'));
const sourceFiles = [
  'graph.ts',
  'nodes.ts',
  'ports.ts',
  'result-mapper.ts',
  'state.ts',
  'hitl-state.ts',
  'hitl-graph.ts',
  'hitl-resume.ts',
  'hitl-result-mapper.ts',
];
const source = sourceFiles.map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'src', file), 'utf8')).join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N18 eval failed: ${message}`);
}

const expectedCases = new Set([
  'handoff_initial_pause',
  'handoff_approve_resume',
  'handoff_deny_resume',
  'missing_resume',
  'invalid_resume',
  'duplicate_resume',
  'stale_thread_resume',
  'unsafe_knowledge_pause',
  'prompt_injection_refusal',
  'published_knowledge_answer',
  'no_published_match',
  'retrieval_failure_fail_closed',
]);

assert(cases.length === expectedCases.size, 'fixed case count changed');
for (const testCase of cases) {
  assert(expectedCases.has(testCase.id), `unexpected case ${testCase.id}`);
  assert(typeof testCase.runStatus === 'string', `${testCase.id} has no run status`);
  assert(typeof testCase.resumeStatus === 'string', `${testCase.id} has no resume status`);
  assert(testCase.path === undefined || typeof testCase.path === 'string', `${testCase.id} has invalid path`);
  assert(testCase.responseType === undefined || typeof testCase.responseType === 'string', `${testCase.id} has invalid response type`);
}

assert(!packageJson.dependencies, 'experiment package has production dependencies');
assert(packageJson.devDependencies?.['@langchain/langgraph'] === '1.4.9', 'LangGraph version is not pinned');
assert(packageJson.devDependencies?.['@langchain/core'] === '1.2.5', 'LangChain core version is not pinned');
assert(source.includes('MemorySaver'), 'N18 does not use the in-memory checkpointer');
assert(source.includes('interrupt'), 'N18 does not use LangGraph interrupt');
assert(source.includes('new Command({ resume:'), 'N18 does not use Command resume');
assert(source.includes('getState'), 'N18 does not inspect checkpoint state');
assert(source.includes('thread_id'), 'N18 does not use a stable thread id');
assert(source.includes('prepare_handoff_pause') && source.includes('request_human_decision') && source.includes('validate_human_decision'), 'HITL nodes are missing');
assert(source.includes('HUMAN_DECISION_MISSING') && source.includes('HUMAN_DECISION_INVALID') && source.includes('HUMAN_RESUME_DUPLICATE') && source.includes('HUMAN_RESUME_STALE'), 'HITL fail-closed error codes are missing');
assert(!/from ['"]@nestjs\//u.test(source), 'NestJS import crossed into the lab');
assert(!/from ['"]@prisma\//u.test(source), 'Prisma import crossed into the lab');
assert(!/from ['"].*agent\.port/u.test(source), 'production AgentPort import crossed into the lab');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(source), 'external model or tracing import crossed into the lab');

console.log(`N18 eval passed: ${cases.length} fixed offline interrupt/resume cases and isolation checks.`);
