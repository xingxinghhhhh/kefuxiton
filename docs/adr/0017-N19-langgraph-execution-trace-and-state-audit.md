# ADR-0017: N19 LangGraph non-production execution trace and state audit

## Status

Accepted as an isolated N19 experiment decision. This ADR does not authorize production audit adoption.

## Decision

Add a deterministic `n19.v1` trace layer inside `packages/langgraph-lab`. N17 and N18 expose explicit, non-default traced runners while their default graphs retain their existing topology, result contracts, and checkpointer boundaries.

`TraceRecorder` stores only structured lifecycle events in memory. `TraceEvent` uses fixed event, node, route, status, outcome, and error-code enums; sequences start at 1 and increase without timestamps, random IDs, runtime object serialization, or file paths. `TracePath` is derived from real node-entered events. Existing graph route values are kept separately as `TraceRoute` and never coerced into node names.

N17 remains uncheckpointed. N18 continues to use process-local `MemorySaver`. The trace sink is not part of LangGraph state and is injected only into an explicitly requested traced runner. Node wrappers preserve node return values and propagate LangGraph interrupt control flow. Resume uses `initial` and `resume` phases; duplicate/stale requests are rejected before invoking the graph and create no new terminal event.

N19 returns an independent `ExecutionTrace` alongside experimental results. It does not modify `packages/contracts`, production `AgentResult`, API, Web, Prisma, production audit, permissions, or external integrations.

## Data safety

Trace data must not contain raw input, customer text, complete interrupt payloads, tokens, operator identity, prompts, hidden policy, model output, Prisma/Nest objects, connection strings, environment variables, paths, checkpoint namespaces, or runtime objects. Only synthetic caller-provided identifiers and fixed structured values are accepted.

## Alternatives and rollback

LangGraph stream events and LangSmith were rejected because they add runtime coupling and can expose internal state. A production audit table was rejected because N19 is an offline lab experiment. Rollback is removal of the N19 trace files, evaluation entry, and documentation, returning to N18 commit `cc70aec`; no migration or production data rollback is needed.
