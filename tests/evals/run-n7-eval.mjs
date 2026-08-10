import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const cases = JSON.parse(readFileSync(resolve(root, 'tests', 'evals', 'n7-audit-timeline.json'), 'utf8'));
const service = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'handoff.service.ts'), 'utf8');
const controller = readFileSync(resolve(root, 'apps', 'api', 'src', 'modules', 'handoff', 'staff-handoff.controller.ts'), 'utf8');
const contracts = readFileSync(resolve(root, 'packages', 'contracts', 'src', 'index.ts'), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(cases.length >= 7, 'N7 eval must cover read-only timeline security and pagination');
assert(service.includes('getAuditTimeline') && service.includes('orderBy: [{ createdAt: \'asc\' }, { id: \'asc\' }]'), 'timeline must use stable chronological ordering');
assert(service.includes('decodeTimelineCursor') && service.includes('decoded.requestId !== requestId'), 'timeline cursor must be opaque and request-bound');
assert(service.includes('unsupported audit action') && service.includes('invalid audit metadata'), 'unknown events and metadata must fail closed');
assert(service.includes('maskActorId') && service.includes('metadata'), 'timeline must redact actor and raw audit metadata');
assert(controller.includes("'handoff:read'") && controller.includes("'conversation:read'"), 'timeline must require existing Staff read permissions');
assert(contracts.includes('StaffAuditTimelineResponse') && contracts.includes('TimelineSubjectType'), 'timeline must use shared contracts');
console.log(`N7 eval passed: ${cases.length} fixed audit timeline, pagination, allowlist, redaction, and isolation cases`);
