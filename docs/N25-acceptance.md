# N25 acceptance: read-only evidence gate snapshot

## Single-node goal

Provide one deterministic, redacted, read-only snapshot for a complete N23 evidence bundle without introducing a new public schema or production surface.

## Acceptance criteria

- [ ] A valid 13-case N23 bundle returns `passed` with `NONE`, count `13`, matching digest, and only fixed safe fields.
- [ ] All N23 invalid results return `blocked` and preserve only the fixed N23 reason code and safe projections.
- [ ] Unknown input, malformed verifier output, verifier exceptions, and out-of-range counts fail closed as `BUNDLE_INVALID`.
- [ ] `verifyEvidenceBundle` is the only completeness authority; N25 does not duplicate N23 validation rules.
- [ ] Snapshot and fixed-eval output have the same nine exact keys and do not include `caseId` or report content.
- [ ] Repeated calls are deterministic and do not mutate caller-owned inputs.
- [ ] Fourteen fixed N25 evaluation cases cover one valid and thirteen invalid/error boundaries.
- [ ] No production API/Web, database, file, network, model, fixture, runner, or MemorySaver side effect is added.

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

N25 remains a non-production offline verification node. Rollback returns to `77c65d9`; no data or migration rollback is required.
