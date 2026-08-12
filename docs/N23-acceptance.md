# N23 acceptance: multi-case replay evidence bundle

## Single-node goal

Create a pure in-memory, digest-only `n23.v1 EvidenceBundle` for the 13 fixed N20 replay cases and verify it against independently supplied, valid N22 evidence envelopes.

## Acceptance criteria

- [x] The bundle contains exactly 13 allowlisted N20 cases in fixed order.
- [x] Each item contains only `caseId` and a lowercase 64-character N22 evidence digest.
- [x] The bundle has fixed fields, canonical compact UTF-8 JSON, a lowercase SHA-256 bundle digest, and an 8 KiB canonical size bound.
- [x] Verification checks bundle structure, case completeness/order, envelope case identity, source version, digest algorithm, envelope digest, and bundle digest.
- [x] Missing, duplicate, unknown, reordered, mismatched, tampered, sensitive, and oversized inputs fail closed with fixed reason codes.
- [x] Results never return reports, original input, runtime objects, or exception text.
- [x] N19/N20/N21/N22 and default N17/N18 behavior remain unchanged; no production, database, file, network, fixture, or MemorySaver access is added.
- [x] Thirteen fixed evaluation cases cover one valid bundle and twelve invalid integrity cases.

## Changed files

- `packages/langgraph-lab/src/bundle-contract.ts`: N23 contract and bounded result types.
- `packages/langgraph-lab/src/bundle-seal.ts`: digest-only sealing, strict validation, and verification.
- `packages/langgraph-lab/test/bundle-*.spec.ts`: completeness, tamper, redaction, order, determinism, and isolation coverage.
- `tests/evals/n23-langgraph-evidence-bundle.json`, `run-n23-eval.mjs`: fixed 13-case boundary evaluation.
- `package.json`: N23 evaluation in the LangGraph lab gate.
- `docs/adr/0021-N23多Case证据包完整性校验.md`, this record, and `docs/运行手册.md`.

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

N23 remains an offline experiment and is not a persistent evidence service or production audit record. Rollback removes N23 changes back to `824d11a`; no data or migration rollback is required.
