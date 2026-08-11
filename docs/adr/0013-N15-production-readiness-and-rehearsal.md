# ADR-0013: Production readiness and rehearsal modes

## Status

Accepted for N15. This decision does not authorize a production deployment.

## Decision

- `local_eval` and `rehearsal` are explicit non-production runtime modes.
- Synthetic knowledge, the deterministic local Agent adapter, and `deny`/`test` Staff identity are allowed only in those modes.
- `production` runs the release-readiness evaluator before NestFactory, Prisma initialization, or port binding.
- The evaluator accepts validated configuration, the N13/N14 business readiness report, and code-owned capability declarations. Environment variables select a mode; they cannot declare a model provider, formal identity adapter, published business source, or deployment target.
- The current repository therefore returns `NOT_READY` for production with stable, redacted reason codes.
- N12 remains a full synthetic release, API, E2E, and rollback rehearsal, but its API runtime is `APP_ENV=rehearsal` and its result is never production readiness.

## Current production blockers

`BUSINESS_NOT_PRODUCTION_READY`, `KNOWLEDGE_SOURCE_NOT_APPROVED`, `SYNTHETIC_NOT_PRODUCTION`, `STAFF_IDENTITY_NOT_CONFIGURED`, `AGENT_PROVIDER_NOT_CONFIGURED`, and `DEPLOYMENT_TARGET_NOT_CONFIGURED` are emitted in a fixed order when applicable.

## Validation and rollback

The read-only command is:

```text
pnpm release:readiness --target=local_eval
pnpm release:readiness --target=rehearsal
pnpm release:readiness --target=production
```

N15 adds no migration and no external call. Rollback is a normal Git revert to the N14 commit `94b3d6a`; no reset, clean, or database deletion is required.
