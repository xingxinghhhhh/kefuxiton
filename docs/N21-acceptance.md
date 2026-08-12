# N21 acceptance: LangGraph replay diagnostics and minimal failure reports

## Single-node goal

Generate a stable, readable, bounded `n21.v1` report from an N20 `ReplayResult` without rerunning LangGraph or exposing raw replay data.

## Acceptance criteria

- [x] `n21.v1` has a fixed allowlist for status, diagnostic kind, reason code, comparison basis, safe summary, determinism, and first mismatch.
- [x] N20 `ReplayResult` and N19/N20 contracts remain unchanged.
- [x] Passed, golden mismatch, non-deterministic, request rejected, fixture rejected, sensitive-output rejected, and internal failure are distinct.
- [x] Unknown fields, unknown enum values, oversized arrays, out-of-range indices/counts, malformed nested objects, and sensitive values fail closed without echoing input.
- [x] Report arrays are limited to 32 items, numeric counters/indices to 0–128, and serialized output to 16 KiB.
- [x] The mapper is pure with respect to replay execution: no LangGraph graph, MemorySaver, fixture registry, database, network, model, path, environment, identifier, or stack is accessed.
- [x] Twenty-one fixed N21 evaluation cases cover all 13 N20 passed cases and every listed failure class.

## Changed files

- `packages/langgraph-lab/src/replay-diagnostic-contract.ts`: `n21.v1` report, safe nested contracts, enums, and bounds.
- `packages/langgraph-lab/src/replay-diagnostics.ts`: strict validation, fixed error mapping, bounded copying, and fail-closed redaction.
- `packages/langgraph-lab/test/replay-diagnostics.spec.ts`: 13 passed cases and mismatch/error mapping.
- `packages/langgraph-lab/test/replay-diagnostics-redaction.spec.ts`: unknown fields, sensitive values, and bounds.
- `packages/langgraph-lab/test/replay-diagnostics-determinism.spec.ts`: stable output and immutability.
- `tests/evals/n21-langgraph-replay-diagnostics.json`, `run-n21-eval.mjs`: 21 static boundary cases.
- `package.json`: includes N21 in the LangGraph lab gate.
- `docs/adr/0019-N21-replay-diagnostics.md`, this record, and `docs/运行手册.md`.

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

## Limits and rollback

N21 does not modify N20 goldens, replay execution, production API/Web, persistence, monitoring, or deployment. Rollback is removal of N21 changes back to `e92befa`.
