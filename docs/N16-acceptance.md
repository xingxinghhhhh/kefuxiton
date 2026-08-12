# N16 acceptance: runtime health and readiness

## Single-node goal

Keep the legacy health endpoint compatible and add a safe, read-only liveness/readiness loop without exposing production readiness details.

## Acceptance criteria

- [x] `GET /api/v1/health` retains `{ status: "ok", service: "api" }`.
- [x] `GET /api/v1/health/live` returns 200 without invoking Prisma and reports the validated runtime mode.
- [x] `GET /api/v1/health/ready` performs a shared read-only `SELECT 1` probe with a fixed 1000ms deadline.
- [x] Probe failure returns 503 with `DATABASE_UNAVAILABLE`, `DATABASE_TIMEOUT`, or `INTERNAL_HEALTH_FAILURE`.
- [x] Health responses use `Cache-Control: no-store` and contain no secrets, paths, customer data, knowledge content, or production blocker details.
- [x] Liveness and readiness are unauthenticated process/dependency probes; no business or audit writes are triggered.
- [x] N15 production startup gate and production readiness semantics remain unchanged.
- [x] No Prisma schema, migration, frontend page, customer permission, Agent, knowledge, handoff, audit, or feedback behavior changed.

## Database lifecycle boundary

The existing Prisma startup connection remains unchanged. A database failure before successful application initialization prevents the API from listening; liveness is available only after successful startup. A later database failure leaves liveness available and makes readiness return 503.

## Validation

```text
pnpm lint
pnpm typecheck
pnpm test:unit
RUN_REAL_DB_TESTS=1 pnpm test:integration
pnpm test:api-smoke
pnpm test:e2e
pnpm test:eval
pnpm build
pnpm verify
pnpm test:release-rehearsal
```

The N16 fixed evaluation covers legacy compatibility, liveness isolation, readiness success/failure/timeout, concurrent probe deduplication, runtime modes, redaction, and the read-only query boundary.
