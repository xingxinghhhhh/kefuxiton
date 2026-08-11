import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n10-feedback-audit-timeline.json'), 'utf8'));
const handoffService = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'handoff.service.ts'), 'utf8');
const conversationsService = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'conversations', 'conversations.service.ts'), 'utf8');
const contracts = readFileSync(resolve(root, 'packages', 'contracts', 'src', 'index.ts'), 'utf8');
const openapi = readFileSync(resolve(root, 'packages', 'contracts', 'openapi', 'openapi.yaml'), 'utf8');
const staffUi = readFileSync(resolve(root, 'apps', 'web', 'components', 'staff', 'staff-handoff-shell.tsx'), 'utf8');
const integration = readFileSync(resolve(root, 'apps', 'api', 'test', 'handoff.integration.spec.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(cases.length >= 10, 'N10 eval must cover association, redaction, fail-closed, and read-only boundaries');
for (const category of ['fixed_actions', 'explicit_handoff_scope', 'legacy_null_hidden', 'human_association', 'ai_boundary', 'fixed_result_mapping', 'redacted_projection', 'permission_reuse', 'fail_closed', 'read_only']) {
  assert(cases.some((testCase) => testCase.category === category), `N10 eval is missing ${category} coverage`);
}
for (const value of ['message_feedback_created', 'message_feedback_replayed', 'message_feedback_conflict', 'helpful', 'not_helpful', 'feedbackValue']) {
  assert(handoffService.includes(value) || contracts.includes(value) || openapi.includes(value), `N10 fixed projection is missing ${value}`);
}
assert(conversationsService.includes('operatorReply: { select: { handoffRequestId: true } }') && conversationsService.includes('handoffRequestId: handoffRequestId ?? undefined'), 'N10 must associate human feedback through OperatorReply');
assert(handoffService.includes('where: { handoffRequestId: request.id, conversationId: request.conversationId }'), 'N10 must keep the double timeline boundary');
assert(handoffService.includes("outcome === 'conflict' && action === 'message_feedback_conflict"), 'N10 must map feedback conflicts to rejected');
assert(handoffService.includes('unsupported feedback metadata') && handoffService.includes('unsupported feedback value'), 'N10 must fail closed for feedback projection data');
assert(handoffService.includes("'message_feedback_created', 'message_feedback_replayed', 'message_feedback_conflict'"), 'N10 action allowlist is incomplete');
assert(contracts.includes('feedbackValue: FeedbackValue | null') && openapi.includes('feedbackValue:'), 'N10 shared contract/OpenAPI projection is incomplete');
assert(staffUi.includes('客户反馈：') && staffUi.includes('shortSubjectRef') && staffUi.includes('event.feedbackValue'), 'N10 Staff UI must show only fixed feedback and a shortened message reference');
assert(integration.includes('legacyFeedbackEvent') && integration.includes('timelineWithFeedback'), 'N10 integration tests must cover associated and legacy-null events');
assert(!handoffService.includes('this.agent') && !handoffService.includes('@Post'), 'N10 must not add AI calls or write endpoints');

console.log(`N10 eval passed: ${cases.length} fixed feedback-audit timeline, association, redaction, and read-only cases`);
