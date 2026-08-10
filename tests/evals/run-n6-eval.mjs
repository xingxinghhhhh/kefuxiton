import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n6-internal-context.json'), 'utf8'));
const service = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'handoff.service.ts'), 'utf8');
const controller = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'staff-handoff.controller.ts'), 'utf8');
const contracts = readFileSync(resolve(root, 'packages', 'contracts', 'src', 'index.ts'), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(cases.length >= 7, 'N6 eval must cover isolation, allowlist, idempotency, redaction, and AI boundaries');
assert(service.includes('requireClaimedOwner') && service.includes('claimedBy !== principal.staffId'), 'internal context must enforce claimed owner');
assert(service.includes('handoffRequestId_idempotencyKey') && service.includes('operationKey'), 'internal context writes must be idempotent');
assert(service.includes('internal_note_created') && service.includes('conversation_tag_removed'), 'internal context operations must be audited');
assert(controller.includes("'handoff:context'") && controller.includes('INTERNAL_TAGS'), 'context endpoints must be staff-only and allowlisted');
assert(contracts.includes('InternalTag') && contracts.includes('StaffInternalContextResponse'), 'internal context must have shared contracts');
assert(!service.includes('this.agent'), 'internal context must not call AgentPort');
console.log(`N6 eval passed: ${cases.length} fixed internal-context isolation, allowlist, idempotency, and audit cases`);
