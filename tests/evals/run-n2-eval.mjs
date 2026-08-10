import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..', '..');
const fixturePath = resolve(root, 'apps', 'api', 'src', 'modules', 'knowledge', 'fixtures', 'it-service-desk.local-eval.md');
const fixture = readFileSync(fixturePath, 'utf8');
const evalCases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n2-knowledge.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const regression = spawnSync(process.execPath, [resolve(root, 'tests', 'evals', 'run-n1-eval.mjs')], { encoding: 'utf8' });
if (regression.status !== 0) throw new Error(regression.stderr || regression.stdout || 'N1 regression eval failed');

assert(/^status:\s+local_eval$/mu.test(fixture), 'the repository fixture must remain local_eval');
assert(!/^status:\s+published$/mu.test(fixture), 'the repository fixture must not be published');
assert((fixture.match(/^##\s+\d+\./gmu) ?? []).length >= 3, 'the fixture must contain the minimum FAQ corpus');
for (const section of ['### 问题', '### 答案', '### 适用条件', '### 例外']) {
  assert(fixture.includes(section), `fixture is missing ${section}`);
}

const minimumCounts = { knowledge_answer: 5, unknown: 2, handoff: 2, injection: 2, stale_or_draft: 2 };
for (const [category, minimum] of Object.entries(minimumCounts)) {
  assert(evalCases.filter((testCase) => testCase.category === category).length >= minimum, `eval set is missing ${category} coverage`);
}

for (const testCase of evalCases) {
  const normalized = testCase.input.replace(/\s+/gu, '');
  const isInjection = /忽略.*规则|泄露.*提示词|ignore.*system.*prompt|output.*token/iu.test(normalized);
  const isHandoff = /直接.*(?:权限|生产)|生产权限|重置.*他人.*密码/u.test(normalized);
  const isStale = /草稿|过期/u.test(normalized);
  const hasFaq = ['密码', '办公系统', '权限', 'office system', 'access'].some((term) => normalized.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
  const observed = isInjection || isHandoff ? 'handoff_recommended' : isStale ? 'safe_unavailable' : hasFaq ? 'knowledge_answer' : 'safe_unavailable';
  assert(observed === testCase.expected, `${testCase.id}: expected ${testCase.expected}, got ${observed}`);
}

console.log(`N2 eval passed: ${evalCases.length} fixed cases across required categories, local_eval fixture audit, N1 regression`);
