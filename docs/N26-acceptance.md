# N26 acceptance: evidence gate snapshot replay and version regression

## Single-node goal

Prove that the N25 gate snapshot is deterministic across fresh controlled inputs and that N20-N25 version, reason-code, exact-key, and fail-closed behavior remains fixed.

## Acceptance criteria

- [ ] Fourteen fixed in-memory N25 scenarios are each executed twice from fresh objects.
- [ ] Both snapshots match field-by-field and byte-for-byte under the explicit nine-key canonical JSON projection.
- [ ] Current N23/N25 success, unknown/future schema, source/algorithm mappings, all 14 N23 reason codes, and fail-closed behavior are covered by eight regression cases.
- [ ] Replay tests reuse `buildEvidenceGateSnapshot`; they do not rerun LangGraph or duplicate N23 validation.
- [ ] Inputs are isolated and no case details, customer content, prompt, path, token, trace ID, or runtime object is returned.
- [ ] N23 13 cases, N24 16 cases, N25 14 cases, and all repository gates remain passing.
- [ ] No runtime schema, production dependency, API/Web/database/file/network/model integration or persistent replay result is added.

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

N26 remains a non-production offline verification node. Rollback returns to `6f03aac`; no data or migration rollback is required.
