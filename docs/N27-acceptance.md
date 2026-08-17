# N27 acceptance: end-to-end evidence-chain consistency

## Single-node goal

Prove offline that the fixed N20 case order, N22 envelope digest, N23 item and bundle digest, N25 gate snapshot, and N26 fresh replay all describe the same evidence chain without adding a runtime contract.

## Acceptance criteria

- [ ] Thirteen fixed N20 cases each preserve envelope case identity and evidence digest into the corresponding N23 item.
- [ ] Existing N22 envelope verification, N23 sealing/verification, and N25 snapshot construction are reused; no digest or validation rule is duplicated.
- [ ] N23 bundle digest and N25 nine-field snapshot agree for the complete valid chain.
- [ ] Two fresh N26 replays equal a directly constructed N25 snapshot field-by-field and under the explicit compact JSON projection.
- [ ] Envelope digest, bundle item digest, bundle digest, and case-order tampering all fail closed with existing reason codes.
- [ ] Fixed N27 evaluation has 18 cases: 13 chain, 1 replay, and 4 tamper cases.
- [ ] Inputs remain fresh, in memory, isolated, and synthetic; output contains no report, prompt, token, path, checkpoint, trace, thread, or runtime object.
- [ ] N17-N26 evaluations remain passing and no production source, API, Web, database, dependency, or runtime schema is added.

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
pnpm test:api-smoke
pnpm test:release-rehearsal
git diff --check
```

## Limits and rollback

N27 remains a non-production offline verification node. Rollback returns to `718019b`; no data or migration rollback is required.
