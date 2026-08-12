import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const cases = JSON.parse(readFileSync(join(root, 'tests', 'evals', 'n17-langgraph-workflow.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(join(root, 'packages', 'langgraph-lab', 'package.json'), 'utf8'));
const sourceFiles = ['graph.ts', 'nodes.ts', 'ports.ts', 'result-mapper.ts', 'state.ts'];
const source = sourceFiles.map((file) => readFileSync(join(root, 'packages', 'langgraph-lab', 'src', file), 'utf8')).join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(`N17 eval failed: ${message}`);
}

const expectedCases = new Set([
  'allow_published_knowledge',
  'prompt_injection',
  'high_risk_handoff',
  'no_published_match',
  'unsafe_knowledge',
  'retrieval_failure',
  'invalid_retrieval_output',
]);

assert(cases.length === expectedCases.size, 'fixed case count changed');
for (const testCase of cases) {
  assert(expectedCases.has(testCase.id), `unexpected case ${testCase.id}`);
  assert(typeof testCase.path === 'string', `${testCase.id} has no fixed path`);
  assert(typeof testCase.responseType === 'string', `${testCase.id} has no fixed response type`);
}

assert(!packageJson.dependencies, 'experiment package has production dependencies');
assert(packageJson.devDependencies?.['@langchain/langgraph'] === '1.4.9', 'LangGraph version is not pinned');
assert(packageJson.devDependencies?.['@langchain/core'] === '1.2.5', 'LangChain core version is not pinned');
assert(source.includes('Annotation.Root'), 'graph state is not declared with Annotation.Root');
assert(source.includes('StateGraph'), 'StateGraph is not used');
assert(source.includes('.compile()'), 'LangGraph graph is not compiled');
assert(source.includes('classify_request') && source.includes('retrieve_published') && source.includes('inspect_knowledge'), 'required graph nodes are missing');
assert(source.includes('safe_refusal') && source.includes('handoff_recommended') && source.includes('safe_unavailable') && source.includes('mock_fallback'), 'required terminal nodes are missing');
assert(!/from ['"]@nestjs\//u.test(source), 'NestJS import crossed into the lab');
assert(!/from ['"]@prisma\//u.test(source), 'Prisma import crossed into the lab');
assert(!/from ['"].*agent\.port/u.test(source), 'production AgentPort import crossed into the lab');
assert(!/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u.test(source), 'external model or tracing import crossed into the lab');

console.log(`N17 eval passed: ${cases.length} fixed offline LangGraph safety-path cases and isolation checks.`);
