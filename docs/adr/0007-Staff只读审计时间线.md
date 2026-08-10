# ADR 0007：Staff 只读审计时间线

## 状态

Accepted for N7 implementation.

## Decision

Expose a Staff-only read endpoint for one handoff request: `GET /api/v1/staff/handoff-requests/:requestId/timeline`. It reads only `AuditEvent` rows associated with the target handoff and its conversation, orders by `createdAt ASC, id ASC`, and uses a request-bound opaque cursor with a default limit of 50 and a maximum of 100.

The response is a fixed allowlisted projection. It maps `staff` to `operator`, masks actor IDs, maps outcomes to `succeeded` or `replayed`, maps tag replay actions to their base tag action with `replayed`, and never returns raw metadata. Reply bodies, internal note bodies, credentials, prompts, paths, and customer sensitive data are excluded. Unknown actions, outcomes, tags, or metadata fail closed.

The endpoint requires existing `handoff:read` and `conversation:read` Staff permissions. Customer credentials and invalid or cross-session request IDs are rejected. No new tables, migrations, write operations, AI calls, retrieval calls, or external calls are introduced.

## Rollback and degradation

Rollback is the N6 commit `00107ec`. If the timeline fails, disable only the timeline entry/endpoint and return a clear error; never fall back to raw audit data. Existing customer chat, human replies, internal context, and AI suppression remain unchanged.

## Verification

Tests cover ordering, cursor binding, pagination, empty and invalid input, unknown-event fail-closed behavior, Staff permissions, customer denial, redaction, API smoke, Staff E2E display, and N1–N6 regression.
