# ADR-0018: N20 LangGraph non-production trace replay and deterministic regression

## Status

Accepted as an isolated N20 experiment decision. This ADR does not authorize a production replay service.

## Decision

Add an `n20.v1` replay contract and runner under `packages/langgraph-lab`. Replay is authoritative only when it selects a fixed synthetic fixture by allowlisted `caseId`, runs the existing N17/N18 traced runners twice, and compares the safe N19 summary fields against a fixed golden summary and the second run.

The replay request contains only `schemaVersion`, `caseId`, and `fixtureVersion`. Fixture input, ports, and human-decision scripts live in test-only registry implementations and never enter replay output. Each run receives fresh synthetic identifiers, a fresh recorder, and—where N18 is used—a fresh process-local `MemorySaver`.

N19 `n19.v1` remains unchanged. Replay output is a constrained summary containing event types, node path, routes, status, outcome, error code, event count, and sequence. Mismatches report only a fixed field kind, safe index, and constrained values. Invalid requests, unknown fixtures, version/hash errors, mismatch, nondeterminism, and internal replay failures fail closed.

## Boundaries

N17 remains without a checkpointer. N18 keeps its existing in-memory interrupt/resume behavior. Replay does not import test fixtures into production source, does not serialize input, payload, checkpoint, runtime objects, paths, or exception stacks, and does not call databases, APIs, Web, models, LangSmith, LangGraph Server, or external systems.

## Alternatives and rollback

Trace-only replay was rejected because a redacted N19 trace intentionally lacks the input, retrieval content, and human decision required to reconstruct business semantics. A production replay service and persistent replay history are out of scope. Rollback removes N20 replay source, test fixtures, tests, eval entry, and docs, returning to N19 commit `88c117d`; no data or migration rollback is required.
