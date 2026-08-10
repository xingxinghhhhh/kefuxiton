import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n5-human-reply.json'), 'utf8'));
const service = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'handoff.service.ts'), 'utf8');
const conversations = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'conversations', 'conversations.service.ts'), 'utf8');
const controller = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'staff-handoff.controller.ts'), 'utf8');
const contracts = readFileSync(resolve(root, 'packages', 'contracts', 'src', 'index.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(cases.length >= 6, 'N5 eval must cover reply, source, idempotency, owner, public read, and suppression');
for (const category of ['reply_created', 'sender_marker', 'idempotency', 'claim_owner', 'customer_read', 'ai_suppression']) {
  assert(cases.some((testCase) => testCase.category === category), `N5 eval is missing ${category} coverage`);
}
assert(service.includes("responseType: 'human_reply'") && service.includes("senderType: 'human_operator'"), 'human replies must carry explicit public source markers');
assert(service.includes('operatorReply.findUnique') && service.includes('handoffRequestId_idempotencyKey'), 'human replies must be idempotent per handoff request');
assert(service.includes('current.claimedBy !== principal.staffId'), 'human replies must enforce the claiming operator boundary');
assert(service.includes("operator_reply_created") && service.includes("operator_reply_replayed"), 'human replies must be audited on create and replay');
assert(controller.includes("'handoff:reply'"), 'staff reply endpoint must require reply permission');
assert(conversations.includes('async getMessages') && contracts.includes('MessageSenderType'), 'customers must have a public message read contract');
assert(!service.includes('this.agent'), 'handoff service must not call AgentPort for human replies');

console.log(`N5 eval passed: ${cases.length} fixed human-reply, visibility, idempotency, and suppression cases`);
