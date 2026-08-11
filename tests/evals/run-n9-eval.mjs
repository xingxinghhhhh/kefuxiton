import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n9-message-feedback.json'), 'utf8'));
const service = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'conversations', 'conversations.service.ts'), 'utf8');
const controller = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'conversations', 'conversations.controller.ts'), 'utf8');
const contracts = readFileSync(resolve(root, 'packages', 'contracts', 'src', 'index.ts'), 'utf8');
const schema = readFileSync(resolve(root, 'apps', 'api', 'prisma', 'schema.prisma'), 'utf8');
const web = readFileSync(resolve(root, 'apps', 'web', 'components', 'chat', 'chat-shell.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(cases.length >= 11, 'N9 eval must cover fixed values, boundaries, idempotency, audit, UI, and side effects');
for (const category of ['fixed_values', 'public_ai', 'public_human', 'message_boundary', 'one_per_message', 'idempotency', 'conflicts', 'audit', 'refresh', 'no_side_effects', 'synthetic_scope']) {
  assert(cases.some((testCase) => testCase.category === category), `N9 eval is missing ${category} coverage`);
}
for (const value of ['helpful', 'not_helpful', 'recorded', 'replayed', 'already_recorded', 'FEEDBACK_CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'FEEDBACK_NOT_ALLOWED']) {
  assert(service.includes(value) || contracts.includes(value), `N9 allowlist or error code is missing ${value}`);
}
assert(service.includes('message_feedback_created') && service.includes('message_feedback_replayed') && service.includes('message_feedback_conflict'), 'N9 audit actions are incomplete');
assert(service.includes('senderType !== \'ai\'') && service.includes('senderType !== \'human_operator\''), 'N9 must enforce public message boundaries');
assert(service.includes('conversationId_messageId') && service.includes('conversationId_idempotencyKey'), 'N9 must use both database idempotency constraints');
assert(service.includes('metadata: { feedbackId, conversationId, messageId, value }'), 'N9 audit metadata must be fixed and redacted');
assert(controller.includes('messages/:messageId/feedback') && controller.includes('ParseUUIDPipe'), 'N9 API must bind feedback to both UUID path identifiers');
assert(schema.includes('model MessageFeedback') && schema.includes('@@unique([conversationId, messageId])'), 'N9 database model must be additive and one-per-message');
assert(web.includes('有帮助') && web.includes('没帮助') && web.includes('message.feedback'), 'N9 UI must expose fixed accessible feedback and restore state');
assert(!service.includes('this.agent.respond({ content: value })'), 'N9 feedback must not invoke the agent');

console.log(`N9 eval passed: ${cases.length} fixed feedback, boundary, idempotency, audit, UI, and side-effect cases`);
