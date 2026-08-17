# N30 acceptance: synthetic rehearsal decision example

## Single-node goal

Freeze one explicit synthetic/local_eval/rehearsal decision example without changing N29 semantics or production readiness behavior.

## Fixed example contract

`docs/examples/N30-synthetic-rehearsal-decision.md` must contain synthetic values for the business package, business owner, final approver, knowledge source/version/effective time/owner, Agent Provider, Staff Identity, deployment target, environment target, data retention, rollback owner/plan, and the statuses below:

- `confirmationStatus: SYNTHETIC_ONLY`
- `productionReadiness: NOT_READY`
- `contentSha256: SYNTHETIC_NOT_COMPUTED`
- `canonicalSha256: SYNTHETIC_NOT_COMPUTED`

All non-status references use a `SYNTHETIC_` prefix or the existing `SYNTHETIC-IT-SERVICE-DESK-001` fixture identifier. The example contains no real URL, credential, person, enterprise, customer data, or production system identifier.

## Acceptance criteria

- [ ] N30 evaluation contains exactly 14 cases covering field completeness, synthetic markers, target modes, production gate, N29 boundary, evaluator/file boundary, and runtime regression.
- [ ] `local_eval` remains `LOCAL_EVAL_READY` and `rehearsal` remains `REHEARSAL_READY`.
- [ ] `production` remains `NOT_READY` with the existing six blocker codes and order.
- [ ] N29 template remains pending-confirmation; N29 evaluator and readiness evaluator are not modified.
- [ ] The evaluator is read-only, has no external service call, emits only safe case records, and fails without paths or stacks.
- [ ] No production code, API, Web, database, contract, dependency, lockfile, model, identity, knowledge publication, or deployment behavior changes.

## Validation commands

```text
node --check tests/evals/run-n30-eval.mjs
node tests/evals/run-n30-eval.mjs
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

The production command intentionally exits non-zero with `NOT_READY`; local_eval and rehearsal must retain zero exit codes. Temporary schemas, ports, processes, and generated residue must be cleaned.

## Explicit exclusions and rollback

N30 does not supply formal production values and does not modify N29, readiness logic, production code, API, Web, database, contracts, dependencies, deployment, model, Staff identity, or knowledge publishing. Rollback removes the N30 example and evaluator changes and returns to `1bf8d01`.
