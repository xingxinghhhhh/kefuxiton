# N19 acceptance: LangGraph non-production execution trace and state audit

## Single-node goal

Record deterministic, redacted execution paths, pause/resume states, and terminal summaries for the isolated N17/N18 LangGraph experiments without changing their default behavior or adding production integrations.

## Acceptance criteria

- [x] `n19.v1` defines fixed `TraceEvent`, `ExecutionTrace`, and `AuditSummary` contracts.
- [x] Real node names and graph route values are separate; `TracePath` is derived from node-entered events.
- [x] Sequence numbers are deterministic, start at 1, and duplicate node events are suppressed per phase.
- [x] N17 has an explicit traced runner while its default graph remains without a checkpointer.
- [x] N18 has an explicit traced session while its default session and process-local `MemorySaver` behavior remain unchanged.
- [x] Initial pause, resume, approve, deny, invalid, missing, duplicate, stale, unsafe knowledge, normal knowledge, no-match, injection, and retrieval failure paths are covered.
- [x] Trace output contains no raw input, complete interrupt payload, credentials, operator identity, paths, checkpoint data, or runtime object serialization.
- [x] N19 adds no dependency and does not modify production API, Web, database, contracts, permissions, or audit storage.
- [x] Thirteen fixed N19 cases are included in `pnpm test:langgraph-lab` and therefore `pnpm test:eval`.

## Changed files

- `packages/langgraph-lab/src/trace-contract.ts`: versioned trace enums and data contracts.
- `packages/langgraph-lab/src/trace-recorder.ts`: in-memory recorder, sequence invariants, deduplication, and summary derivation.
- `packages/langgraph-lab/src/graph.ts`, `hitl-graph.ts`: optional non-default node wrappers with explicit `TraceSink` injection.
- `packages/langgraph-lab/src/hitl-resume.ts`: exported experiment mapping/config helpers; default behavior unchanged.
- `packages/langgraph-lab/src/traced-n17.ts`, `traced-n18.ts`: explicit traced runners and safe port error mapping.
- `packages/langgraph-lab/test/trace-*.spec.ts`: contract, N17/N18 behavior, redaction, and determinism tests.
- `tests/evals/n19-langgraph-trace.json`, `run-n19-eval.mjs`: 13 fixed offline cases and isolation checks.
- `package.json`: adds the N19 evaluation to the LangGraph lab gate.
- `docs/adr/0017-N19-langgraph-execution-trace-and-state-audit.md`, this record, and `docs/运行手册.md`.

## Validation commands

The full gate is the repository-required sequence:

```text
pnpm --filter @ai-agent/langgraph-lab typecheck
pnpm --filter @ai-agent/langgraph-lab build
pnpm test:langgraph-lab
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:api-smoke
pnpm test:e2e
pnpm test:eval
pnpm build
pnpm verify
pnpm test:release-rehearsal
```

The initial N19 implementation check passed lab typecheck and 11 lab suites / 28 tests. The remaining repository gates are run before review and commit.

## Limits and risks

N19 is not a production audit event, durable history, customer-data recovery mechanism, operator identity system, or observability integration. Any trace leakage, accidental checkpointer introduction to N17, altered AgentResult, duplicate terminal event, or unapproved external call blocks acceptance.
