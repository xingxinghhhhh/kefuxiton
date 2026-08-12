# ADR-0014: Runtime health and readiness

## Status

Accepted for N16. This decision does not change production authorization.

## Decision

- Keep `GET /api/v1/health` unchanged for existing clients.
- Add unauthenticated, read-only `GET /api/v1/health/live` and `GET /api/v1/health/ready`.
- Liveness reports only that an already initialized API process can answer HTTP. It does not inject Prisma or access the database.
- Readiness runs one shared in-flight, read-only Prisma `SELECT 1` probe with a fixed 1000ms deadline. It returns HTTP 200 when the dependency is available and HTTP 503 with a fixed safe reason code otherwise.
- Database connection failure maps to `DATABASE_UNAVAILABLE`, the fixed deadline maps to `DATABASE_TIMEOUT`, and other probe errors map to `INTERNAL_HEALTH_FAILURE`.
- `production` still fails before NestFactory and does not expose these endpoints under the current N15 capability state. Health readiness is dependency readiness, not production readiness.
- Responses use `Cache-Control: no-store` and never include database URLs, credentials, stack traces, paths, customer data, knowledge content, or detailed production blockers.

## Lifecycle and rollback

The existing Prisma `onModuleInit()` connection lifecycle is intentionally unchanged. If startup cannot connect to PostgreSQL, the API does not listen and no liveness endpoint exists; after a successful startup, a later database interruption leaves liveness available while readiness returns 503.

N16 adds no migration or external call. Rollback is a normal Git revert to N15 commit `1074f56`.
