# N15 acceptance: production readiness and rehearsal separation

## Single-node goal

Separate the N12 synthetic rehearsal from production startup and add one fail-closed, read-only production readiness evaluator.

## Acceptance criteria

- [x] `local_eval` returns `LOCAL_EVAL_READY` for the aligned synthetic package.
- [x] `rehearsal` returns `REHEARSAL_READY` and never `PRODUCTION_READY`.
- [x] `production` returns `NOT_READY` with current business, knowledge, Agent, Staff, and deployment blockers.
- [x] Production API readiness fails before NestFactory, Prisma initialization, and port listening.
- [x] Production/readiness output excludes credentials, database URLs, customer data, and local absolute paths.
- [x] N12 runs with `APP_ENV=rehearsal`; its production publish guard still rejects the synthetic package.
- [x] No API route, Prisma model, migration, frontend behavior, Agent business behavior, or permission behavior was expanded.

## Validation commands

```text
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:api-smoke
pnpm test:e2e
pnpm test:eval
pnpm build
pnpm verify
pnpm release:readiness --target=local_eval
pnpm release:readiness --target=rehearsal
pnpm release:readiness --target=production
pnpm test:release-rehearsal
```

## Database-gated test evidence

The default test commands intentionally skip database suites unless `RUN_REAL_DB_TESTS=1`:

- `apps/api/test/handoff.integration.spec.ts`: skipped by `describeReal` when the flag is absent; it requires PostgreSQL-backed handoff state.
- `apps/api/test/knowledge-state.integration.spec.ts`: skipped by `describeReal` when the flag is absent; it requires PostgreSQL-backed knowledge state.
- `apps/api/test/real-postgres.integration.spec.ts`: excluded by the default unit Jest configuration and gated by `describeReal` in the integration configuration; it requires PostgreSQL-backed persistence.

The skipped counts in the default run were 2 suites/9 tests for unit and 3 suites/10 tests for integration. With two dedicated temporary schemas and `RUN_REAL_DB_TESTS=1`, the evidence was:

```text
RUN_REAL_DB_TESTS=1 pnpm test:unit        -> 9 suites, 26 tests passed
RUN_REAL_DB_TESTS=1 pnpm test:integration -> 5 suites, 12 tests passed
```

The temporary schemas were removed after the runs. No production or shared schema was used.

The production readiness command intentionally exits with code 1 until formal business input, published knowledge, Agent Provider, Staff Identity, and deployment configuration are provided and approved.
