# N31 acceptance: synthetic readiness consistency regression

## Single-node goal

Add a read-only consistency regression that compares the N30 synthetic example, the N29 pending template, and the existing release-readiness CLI without changing any of their semantics.

## Fixed comparison contract

N30 must retain `confirmationStatus=SYNTHETIC_ONLY`, `productionReadiness=NOT_READY`, synthetic Provider/Staff/deployment/retention/rollback references, the existing synthetic fixture identifier, and `contentSha256=canonicalSha256=SYNTHETIC_NOT_COMPUTED`.

N29 must retain `<PENDING>` for all seven formal decision groups, `confirmationStatus=PENDING_CONFIRMATION`, `productionReadiness=NOT_READY`, and pending knowledge hashes.

Readiness must retain `local_eval → LOCAL_EVAL_READY` with exit 0, `rehearsal → REHEARSAL_READY` with exit 0, and `production → NOT_READY` with exit 1. The production blocker order is:

1. `BUSINESS_NOT_PRODUCTION_READY`
2. `KNOWLEDGE_SOURCE_NOT_APPROVED`
3. `SYNTHETIC_NOT_PRODUCTION`
4. `STAFF_IDENTITY_NOT_CONFIGURED`
5. `AGENT_PROVIDER_NOT_CONFIGURED`
6. `DEPLOYMENT_TARGET_NOT_CONFIGURED`

## Acceptance criteria

- [ ] N31 contains exactly 14 cases: N30 contract 6, N29 contract 3, readiness modes 3, blocker order 1, boundary/sanitization 1.
- [ ] The evaluator reuses the readiness CLI and emits only `caseId`, `status`, and `reasonCode`.
- [ ] Evaluator failures do not expose paths, source, environment values, or stacks.
- [ ] No N29/N30 template, readiness evaluator, production code, API, Web, database, dependency, or lockfile changes are present.
- [ ] No real enterprise fact or sensitive value is added.

## Validation commands

```text
node --check tests/evals/run-n31-eval.mjs
node tests/evals/run-n31-eval.mjs
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
```

Confirm no temporary ports, processes, or test schemas remain. Production readiness and N29/N30 behavior must not change.

## Explicit exclusions

N31 does not confirm real business information, enable a real model or Staff Identity, publish knowledge, deploy production, authorize retention, add external services, or change API, Web, database, permissions, dependencies, or production readiness.
