# N20 acceptance: LangGraph non-production trace replay and deterministic regression

## Single-node goal

Create a fixed synthetic-fixture replay loop that reruns N17/N18 traced experiments twice and compares safe, deterministic N19 summaries without storing or exposing source inputs or human-review payloads.

## Acceptance criteria

- [x] `n20.v1` validates requests containing only allowlisted `caseId` and `fixtureVersion`.
- [x] Thirteen fixed N17/N18 cases cover normal, injection, no-match, unsafe knowledge, retrieval failure, invalid retrieval, pause, approve, deny, missing, invalid, duplicate, and stale paths.
- [x] Each replay run creates independent synthetic identifiers, recorder state, and N18 `MemorySaver` state.
- [x] Replay compares fixed golden summaries and a second independent run, reporting the first safe mismatch.
- [x] N19 `n19.v1` remains unchanged; replay output does not expose raw input, knowledge text, decisions, interrupt payloads, checkpoints, IDs, paths, ports, environment variables, or stacks.
- [x] Unknown/malformed requests, unsupported versions, unknown fixtures, hash mismatch, trace mismatch, nondeterminism, and internal failures fail closed.
- [x] N17 remains uncheckpointed and N18 deny remains `safe_unavailable` in the underlying result contract.
- [x] N20 adds no dependency and does not modify production API, Web, database, contracts, permissions, or audit storage.
- [x] Thirteen fixed N20 cases are included in `pnpm test:langgraph-lab` and therefore `pnpm test:eval`.

## Changed files

- `packages/langgraph-lab/src/replay-contract.ts`: `n20.v1` request, summary, mismatch, report, error-code, action, and fixture-registry contracts.
- `packages/langgraph-lab/src/replay-runner.ts`: request validation, fixture hash check, N17/N18 replay execution, summary comparison, first mismatch, and fail-closed results.
- `packages/langgraph-lab/test/replay-fixtures.ts`: test-only synthetic registry and fixed golden summaries.
- `packages/langgraph-lab/test/replay.spec.ts`, `replay-redaction.spec.ts`, `replay-isolation.spec.ts`, `replay-determinism.spec.ts`: replay, security, isolation, and determinism tests.
- `tests/evals/n20-langgraph-replay.json`, `run-n20-eval.mjs`: 13 fixed static replay/boundary cases.
- `package.json`: includes N20 in the LangGraph lab gate.
- `docs/adr/0018-N20-langgraph-trace-replay.md`, this record, and `docs/运行手册.md`.

## Validation commands

The node must pass the repository gate:

```text
pnpm --filter @ai-agent/langgraph-lab typecheck
pnpm --filter @ai-agent/langgraph-lab build
pnpm test:langgraph-lab
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:eval
pnpm build
pnpm verify
pnpm test:release-rehearsal
```

## Limits and risks

N20 is not a production replay API, durable audit, cross-process recovery mechanism, UI, monitoring service, or multi-tenant feature. Golden summaries may need an explicit future node if LangGraph semantics change; silent golden updates are prohibited.
