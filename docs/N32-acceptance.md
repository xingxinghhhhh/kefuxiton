# N32 acceptance: production boundary and rehearsal isolation regression

## Node goal

Add a synthetic, read-only security regression for the production startup boundary and the non-production rehearsal mode. No real business, model, Staff Identity, deployment, retention, or external service information is required.

## Acceptance criteria

- [ ] `tests/evals/n32-production-boundary.json` contains exactly 12 cases: production readiness 3, startup boundary 2, bypass resistance 3, redaction 2, runtime mode 2.
- [ ] Production readiness remains `NOT_READY` with the existing six blocker codes and fixed order.
- [ ] Production startup exits before NestFactory/Prisma/port binding and never listens.
- [ ] Test Staff, `ALLOW_KNOWLEDGE_PUBLISH=1`, and ordinary capability-looking environment variables cannot bypass the gate.
- [ ] Startup failure output is redacted and contains no token, database URL, local path, stack, or customer content.
- [ ] `local_eval` remains `LOCAL_EVAL_READY`; `rehearsal` remains `REHEARSAL_READY` and non-production.
- [ ] Existing N2–N31 evaluations and behavior remain unchanged.
- [ ] No temporary port, process, schema, or generated residue remains after verification.

## Validation commands

```text
node --check tests/smoke/n32-production-boundary.mjs
node --check tests/evals/run-n32-eval.mjs
node tests/evals/run-n32-eval.mjs
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

Production readiness is expected to exit non-zero with `NOT_READY`; local_eval and rehearsal must retain zero exit codes. The smoke and evaluator must emit only safe case status records.

## Exclusions and rollback

N32 does not modify production code, readiness logic, API, Web, database, contracts, dependencies, permissions, deployment, model, Staff Identity, knowledge publication, or production authorization. Rollback returns to `6dffde2` by removing only N32 files and its script entry.
