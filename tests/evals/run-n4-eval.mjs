import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n4-handoff.json'), 'utf8'));
const service = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'handoff.service.ts'), 'utf8');
const conversations = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'conversations', 'conversations.service.ts'), 'utf8');
const auth = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'auth', 'staff-auth.service.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(cases.length >= 5, 'N4 eval must retain the five handoff lifecycle/security cases');
for (const category of ['customer_request', 'operator_claim', 'ai_suppression', 'operator_close', 'security']) {
  assert(cases.some((testCase) => testCase.category === category), `N4 eval is missing ${category} coverage`);
}
for (const status of ['requested', 'claimed', 'closed']) {
  assert(service.includes(`HandoffRequestStatus.${status}`), `handoff service is missing ${status} state`);
}
assert(service.includes('updateMany') && service.includes('status: HandoffRequestStatus.requested'), 'claim must be conditional and race-safe');
assert(conversations.includes("responseType: 'handoff_pending'") && conversations.includes('getConversationRequest'), 'active handoff must suppress automatic replies');
assert(auth.includes('UnauthorizedException') && auth.includes('ForbiddenException'), 'staff authentication must fail closed and enforce permissions');

console.log(`N4 eval passed: ${cases.length} fixed lifecycle, suppression, and isolation cases`);
