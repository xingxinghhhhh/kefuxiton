# ADR 0006：Operator 内部会话备注与固定标签

## 状态

Accepted for N6 implementation; fixed tags are synthetic workflow labels pending business-owner confirmation.

## Decision

Only the current claiming Staff Operator may read or write internal context on a `claimed` handoff. The context contains append-oriented internal notes and an allowlisted set of tags: `urgent`, `billing`, `technical`, and `follow_up`.

Notes are limited to 2000 characters. Note creation and tag add/remove require a server-validated idempotency key. Audit metadata contains identifiers and tag values only; it never contains note content.

## Non-goals

Internal context is never exposed by customer APIs, customer UI, AgentPort, retrieval, prompts, citations, or model output. This node does not add note editing/deletion, custom tags, transfer, notifications, SLA, reporting, external tickets, enterprise identity, or business writes.

## Rollback and degradation

Rollback is the N5 commit `d62ca9e`. If N6 fails, context endpoints fail closed while customer chat, handoff suppression, and operator replies remain on the N5 path. N6 tables are additive and can remain until a separately approved retention/migration plan exists.

## Verification

The integration and E2E gates must cover current-owner isolation, customer denial, allowlist validation, idempotent note/tag writes, audit redaction, refresh recovery, and N1–N5 regression.
