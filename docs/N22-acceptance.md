# N22 acceptance: versioned replay diagnostic evidence envelope

## Single-node goal

Wrap a validated `n21.v1` diagnostic report in a deterministic, tamper-detectable, bounded `n22.v1` in-memory evidence envelope.

## Acceptance criteria

- [x] `EvidenceEnvelope` has exactly six fields: schema version, evidence type, source schema version, digest algorithm, report, and evidence digest.
- [x] Canonical payload excludes `evidenceDigest`, uses fixed field order, compact JSON, UTF-8, retained nulls, and preserves array order.
- [x] SHA-256 is lowercase 64-character hexadecimal and covers the full canonical envelope context plus the validated report.
- [x] N21 reports are copied into a fixed canonical order; unknown fields, unknown values, malformed nested objects, and sensitive values fail closed.
- [x] Reports remain bounded by N21 limits and the envelope is bounded at 20 KiB.
- [x] Verification detects digest tampering, source-version mismatch, unknown fields, sensitive values, and size violations without returning raw content.
- [x] N19/N20/N21 contracts and default N17/N18 behavior remain unchanged; no graph, fixture, database, network, file, or production module is accessed.
- [x] Twenty-six fixed evaluation cases cover 21 valid report seals plus digest tamper, source-version error, unknown field, sensitive value, and size-limit failures.

## Changed files

- `packages/langgraph-lab/src/evidence-contract.ts`: `n22.v1` envelope and verification contracts.
- `packages/langgraph-lab/src/evidence-seal.ts`: canonical copy, SHA-256 seal, strict validation, and verification.
- `packages/langgraph-lab/test/evidence-fixtures.ts`: 21 safe in-memory N21 report fixtures.
- `packages/langgraph-lab/test/evidence-seal.spec.ts`, `evidence-tamper.spec.ts`, `evidence-redaction.spec.ts`, `evidence-determinism.spec.ts`, `evidence-isolation.spec.ts`: seal, verify, tamper, redaction, determinism, and isolation coverage.
- `tests/evals/n22-langgraph-evidence.json`, `run-n22-eval.mjs`: 26 static boundary cases.
- `package.json`: includes N22 in the LangGraph lab gate.
- `docs/adr/0020-N22-replay-evidence-seal.md`, this record, and `docs/运行手册.md`.

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

N22 does not persist evidence or expose it through production interfaces. Rollback is removal of N22 changes back to `81c9b35`.
