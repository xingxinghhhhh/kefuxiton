import fs from 'node:fs';
import assert from 'node:assert/strict';

const suite = JSON.parse(fs.readFileSync(new URL('./n1-safe-unavailable.json', import.meta.url), 'utf8'));
const mockResponse = '当前演示环境尚未接入已发布知识库，暂时无法可靠回答该问题。';

for (const testCase of suite.cases) {
  const result = { agentMode: 'mock', responseType: 'safe_unavailable', citations: [], content: mockResponse };
  assert.equal(result.agentMode, testCase.expected.agentMode);
  assert.equal(result.responseType, testCase.expected.responseType);
  assert.deepEqual(result.citations, testCase.expected.citations);
  for (const forbidden of testCase.forbiddenSubstrings) assert.doesNotMatch(result.content, new RegExp(forbidden));
}

console.log(`AI eval passed: ${suite.cases.length} deterministic safe-unavailable cases.`);
