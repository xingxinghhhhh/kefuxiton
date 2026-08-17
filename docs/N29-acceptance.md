# N29 acceptance: production readiness pending-confirmation freeze

## Single-node goal

Record the seven missing production decision groups as a non-production pending template without supplying real values or changing production readiness behavior.

## Fixed template contract

The template at `docs/templates/N29-生产准入待确认模板.md` must keep these decision fields:

`businessInputPackage`, `businessOwnerRef`, `finalApproverRef`, `knowledgeSourceRef`, `knowledgeVersion`, `knowledgeEffectiveAt`, `agentProviderRef`, `staffIdentityRef`, `deploymentTargetRef`, `dataRetentionPolicyRef`, `rollbackOwnerRef`, `rollbackPlanRef`, `confirmationStatus`, `productionReadiness`.

All unresolved references are `<PENDING>`. `confirmationStatus` is `PENDING_CONFIRMATION`; `productionReadiness` is `NOT_READY`; `contentSha256` and `canonicalSha256` remain `<PENDING>` until a separate approved source exists.

## Acceptance criteria

- [ ] N29 evaluation contains exactly 15 cases: template/placeholder integrity 5, seven pending decision groups 7, production gate 1, local_eval 1, rehearsal 1.
- [ ] The template contains no real business name, person, model, URL, credential, hash, customer data, or production identifier.
- [ ] Production readiness still returns `NOT_READY` with the existing blocker set and order.
- [ ] `local_eval` remains `LOCAL_EVAL_READY`; `rehearsal` remains `REHEARSAL_READY`.
- [ ] Existing N15/N28 evaluator behavior, API, Web, contracts, database, dependencies, and production code remain unchanged.
- [ ] The evaluator is read-only, has no external service call, emits only `caseId`, `status`, and `reasonCode`, and fails safely without paths or stacks.

## Validation commands

```text
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
pnpm release:readiness --target=local_eval
pnpm release:readiness --target=rehearsal
pnpm release:readiness --target=production
git diff --check
```

Production must remain non-zero with `NOT_READY`; local_eval and rehearsal must retain their successful results. Test schemas, ports, processes, and generated residue must be cleaned.

## Limits and rollback

N29 does not add formal production values, production code, API, Web, database, dependency, environment variable, external integration, deployment, model, Staff identity, or knowledge publishing. Rollback returns to `fc3d7ab` without data or migration rollback.
