# N24 acceptance: evidence bundle determinism and compatibility

## Single-node goal

Freeze deterministic, mutation-isolated, fail-closed version compatibility behavior for the existing N23 `n23.v1 EvidenceBundle` without introducing a new evidence schema.

## Acceptance criteria

- [x] Semantically equivalent valid N22 envelopes produce identical N23 bundle values and bundle digest regardless of property insertion order.
- [x] N23 preserves fixed case ordering and rejects reordered input rather than silently sorting it.
- [x] Sealed bundles do not change when caller-owned envelopes or input arrays are mutated afterward.
- [x] Verification does not mutate caller-owned bundles or envelopes and repeated verification is identical.
- [x] Current version, unknown version, source version, algorithm, envelope structure, envelope tamper, and bundle tamper behaviors are fixed by the existing N23 reason codes.
- [x] N23 public fields, API, reason codes, N19–N22 contracts, and N17/N18 behavior remain unchanged.
- [x] Sixteen fixed N24 evaluation cases cover deterministic, mutation-isolation, compatibility, and regression behavior.
- [x] No file, database, network, model, fixture, runner, MemorySaver, or production side effect is added.

## Changed files

- `packages/langgraph-lab/test/bundle-determinism.spec.ts`: canonical and input-order determinism.
- `packages/langgraph-lab/test/bundle-compatibility.spec.ts`: version and algorithm compatibility matrix.
- `packages/langgraph-lab/test/bundle-mutation-isolation.spec.ts`: caller-object mutation isolation.
- `packages/langgraph-lab/test/bundle-regression.spec.ts`: N23 public shape, reason-code, and tamper regression.
- `tests/evals/n24-langgraph-evidence-bundle.json`, `run-n24-eval.mjs`: fixed 16-case boundary evaluation.
- `package.json`: N24 evaluation in the LangGraph lab gate.
- `docs/adr/0022-N24证据包确定性与版本兼容.md`, this record, and `docs/运行手册.md`.

## Validation commands

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

N24 remains a non-production offline verification node. Rollback returns to `ce0367e`; no data or migration rollback is required.
