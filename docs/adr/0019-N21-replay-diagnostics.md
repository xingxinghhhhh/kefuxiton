# ADR-0019: N21 LangGraph non-production replay diagnostics

## Status

Accepted as an isolated N21 experiment decision. This ADR does not authorize a production replay or diagnostics service.

## Decision

Add an `n21.v1` diagnostic contract and a pure `diagnoseReplayResult` mapper under `packages/langgraph-lab`. The mapper consumes only a strictly validated N20 `ReplayResult`; it does not rerun a graph, read a fixture, create a checkpointer, or access a database, network, model, or production module.

The report preserves only allowlisted N20 identifiers, statuses, safe summaries, constrained mismatch values, and fixed reason codes. It distinguishes passed, golden mismatch, non-determinism, request rejection, fixture rejection, sensitive-output rejection, and internal failure. Unknown fields, unknown enum values, oversized arrays, out-of-range numbers, and malformed nested objects fail closed without echoing the input.

`n19.v1` and `n20.v1` remain unchanged. The report is a new contract with fixed field order, bounded arrays and indices, and a 16 KiB serialized-size limit. N21 has 21 fixed evaluation cases: 13 passed cases plus golden mismatch, non-determinism, request rejection, three fixture rejection classes, sensitive-output rejection, and internal failure.

## Boundaries and rollback

N21 is offline, in-memory, and non-production. It does not expose an API, Web UI, CLI service, persistent history, monitoring, alerting, cross-process recovery, multi-tenancy, real identity, real data, or runtime exception text. Rollback removes N21 source, tests, eval entry, and docs, returning to N20 commit `e92befa`; no database or production configuration rollback is required.
