import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'tests/evals/n42-frontend-experience.json'), 'utf8'));
const customerSource = readFileSync(join(root, 'apps/web/components/chat/chat-shell.tsx'), 'utf8');
const staffSource = readFileSync(join(root, 'apps/web/components/staff/staff-handoff-shell.tsx'), 'utf8');
const e2eSource = readFileSync(join(root, 'apps/web/tests/e2e/chat.spec.ts'), 'utf8');
const stylesheet = readFileSync(join(root, 'apps/web/app/globals.css'), 'utf8');

const expectedCaseIds = [
  'N42-CUSTOMER-MESSAGE', 'N42-CUSTOMER-CITATION', 'N42-SAFE-REFUSAL', 'N42-HANDOFF-PENDING',
  'N42-FEEDBACK-STATE', 'N42-STAFF-QUEUE-DETAIL', 'N42-TIMELINE-REDACTION', 'N42-ROLE-ISOLATION',
];

function assert(condition, reasonCode) {
  if (!condition) throw new Error(reasonCode);
}

function hasAll(source, fragments) {
  return fragments.every((fragment) => source.includes(fragment));
}

const checks = new Map([
  ['N42-CUSTOMER-MESSAGE', () => hasAll(customerSource, ['发送问题', 'message-bubble', 'boundary-banner', 'insight-rail'])],
  ['N42-CUSTOMER-CITATION', () => hasAll(customerSource, ['citation-block', 'citation.title', 'citation.version', 'citation.locator'])],
  ['N42-SAFE-REFUSAL', () => hasAll(customerSource, ['safe_unavailable', '安全拒答'])],
  ['N42-HANDOFF-PENDING', () => hasAll(customerSource, ['handoffStatus', 'handoff_pending', '人工接管期间不会继续自动回复'])],
  ['N42-FEEDBACK-STATE', () => hasAll(customerSource, ['submitMessageFeedback', '反馈已记录', '反馈提交失败，请重试'])],
  ['N42-STAFF-QUEUE-DETAIL', () => hasAll(staffSource, ['listStaffHandoffs', 'staff-request', 'Internal context', '人工回复'])],
  ['N42-TIMELINE-REDACTION', () => hasAll(staffSource, ['Audit timeline', 'Feedback audit events', 'staff-detail-section', '脱敏'])],
  ['N42-ROLE-ISOLATION', () => hasAll(customerSource, ['/staff/handoffs', '客户与客服隔离']) && hasAll(staffSource, ['/chat', '生产身份默认拒绝']) && hasAll(e2eSource, ['role-scoped', '#staff-token', '#message']),
  ],
]);

try {
  assert(manifest.schemaVersion === 'n42.v1', 'N42_MANIFEST_SCHEMA');
  assert(manifest.nodeId === 'N42' && manifest.syntheticOnly === true && manifest.productionIntegration === false, 'N42_PRODUCTION_BOUNDARY');
  assert(Array.isArray(manifest.cases) && manifest.cases.length === expectedCaseIds.length, 'N42_CASE_COUNT');
  assert(JSON.stringify(manifest.cases.map((item) => item.id)) === JSON.stringify(expectedCaseIds), 'N42_CASE_ALLOWLIST');
  assert(hasAll(stylesheet, ['.app-frame', '.workspace-grid', '.insight-rail', '.staff-layout', '.staff-detail-section']), 'N42_STYLE_CONTRACT');
  assert(!/DATABASE_URL|postgresql:\/\/|BEGIN PRIVATE KEY|stack trace/iu.test(`${customerSource}\n${staffSource}`), 'N42_SOURCE_REDACTION');

  for (const testCase of manifest.cases) {
    assert(checks.has(testCase.id) && checks.get(testCase.id)(), `N42_CASE_${testCase.id}`);
    console.log(JSON.stringify({ caseId: testCase.id, status: 'passed', reasonCode: 'NONE' }));
  }
  console.log(JSON.stringify({ nodeId: 'N42', status: 'accepted', acceptance: 'N42_ACCEPTED', evalCount: expectedCaseIds.length, syntheticOnly: true, production: 'NOT_READY' }));
} catch (error) {
  console.log(JSON.stringify({ nodeId: 'N42', status: 'failed', reasonCode: error instanceof Error ? error.message : 'N42_EVAL_FAILED' }));
  process.exitCode = 1;
}
