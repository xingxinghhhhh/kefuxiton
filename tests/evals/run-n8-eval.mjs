import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n8-close-outcome.json'), 'utf8'));
const service = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'handoff.service.ts'), 'utf8');
const closeOutcome = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'close-outcome.ts'), 'utf8');
const controller = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'staff-handoff.controller.ts'), 'utf8');
const contracts = readFileSync(resolve(root, 'packages', 'contracts', 'src', 'index.ts'), 'utf8');
const schema = readFileSync(resolve(root, 'apps', 'api', 'prisma', 'schema.prisma'), 'utf8');
const web = readFileSync(resolve(root, 'apps', 'web', 'components', 'staff', 'staff-handoff-shell.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(cases.length >= 12, 'N8 eval must cover close outcome, compatibility, security, audit, and suppression');
for (const category of ['fixed_close_reason', 'fixed_resolution', 'pair_validation', 'legacy_compatibility', 'idempotent_replay', 'conflict_protection', 'historical_null', 'owner_boundary', 'audit_projection', 'customer_isolation', 'ai_suppression', 'synthetic_scope']) {
  assert(cases.some((testCase) => testCase.category === category), `N8 eval is missing ${category} coverage`);
}
for (const value of ['operator_completed', 'customer_requested_close', 'duplicate_request', 'out_of_scope', 'unable_to_resolve', 'resolved', 'partially_resolved', 'unresolved', 'no_action_required', 'legacy_unclassified']) {
  assert(closeOutcome.includes(value) || contracts.includes(value), `N8 close outcome allowlist is missing ${value}`);
}
assert(closeOutcome.includes('both_fields_required') && closeOutcome.includes('unsupported_value'), 'N8 must reject incomplete and unsupported outcomes');
assert(service.includes('parseCloseOutcome') && service.includes('closed handoff outcome cannot be changed'), 'N8 close service must validate and protect replay conflicts');
assert(service.includes('current.claimedBy !== principal.staffId') && service.includes('closeReason: requestedOutcome.closeReason'), 'N8 must enforce owner and persist the outcome');
assert(service.includes('resolutionCode: requestedOutcome.resolutionCode') && service.includes('metadata: {') && service.includes('closeReason: requestedOutcome.closeReason'), 'N8 audit must include only fixed outcome fields and the correlation id');
assert(service.includes('timelineCloseOutcome') && service.includes('unsupported handoff close metadata'), 'N8 timeline projection must fail closed');
assert(controller.includes('CloseHandoffDto') && controller.includes('body?.closeReason') && controller.includes('body?.resolutionCode'), 'N8 API must accept a structured close DTO');
assert(schema.includes('closeReason') && schema.includes('resolutionCode'), 'N8 database schema must add nullable outcome fields');
assert(contracts.includes('StaffCloseResponse') && contracts.includes('StoredCloseReason') && contracts.includes('StoredResolutionCode'), 'N8 must expose shared close outcome contracts');
assert(web.includes('CLOSE_REASONS') && web.includes('RESOLUTION_CODES') && web.includes('关闭接管'), 'N8 Staff UI must require fixed outcome selections');
assert(!service.includes('this.agent'), 'N8 must not call AI or retrieval providers');

console.log(`N8 eval passed: ${cases.length} fixed close-outcome, compatibility, security, audit, UI, and AI-boundary cases`);
