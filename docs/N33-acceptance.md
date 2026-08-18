# N33 acceptance: synthetic/rehearsal evidence final seal

## Node goal

Freeze one read-only `n33.v1` manifest that summarizes the already accepted N29–N32 synthetic/local_eval/rehearsal evidence without adding production capabilities or persisting raw evidence.

## Acceptance criteria

- [ ] The manifest uses the fixed root field order and `n33.v1` schema.
- [ ] `nodeOrder` is exactly N29, N30, N31, N32; item evaluation counts are 15, 14, 14, 12.
- [ ] Readiness is fixed to `LOCAL_EVAL_READY`, `REHEARSAL_READY`, and `NOT_READY`; production blocker order is unchanged.
- [ ] `syntheticOnly=true` and `productionIntegration=false`.
- [ ] `manifestDigest` is the lowercase SHA-256 of the compact UTF-8 manifest with its own field excluded.
- [ ] N33 contains exactly 16 fixed cases: node summary 4, readiness 3, blocker order 1, safety boundary 3, manifest integrity 2, fail-closed tamper cases 2, existing entry points 1.
- [ ] Evaluator output contains only `caseId`, `status`, and `reasonCode`; no paths, source, environment values, credentials, customer data, or stacks.
- [ ] N29–N32 files and behavior remain unchanged; production remains `NOT_READY`.

## N33-R1 acceptance: same-schema rehearsal isolation

- [ ] `tests/smoke/api-production.mjs` records a content-free business baseline and tracks only its own conversations.
- [ ] API smoke cleanup deletes only its owned business relations in foreign-key-safe order and preserves the published synthetic knowledge fixture.
- [ ] `scripts/run-release-rehearsal.mjs` compares the post-smoke relation summary with the pre-smoke rehearsal baseline before starting E2E.
- [ ] The same release rehearsal schema still runs API smoke followed by E2E; no E2E is skipped and no assertion is weakened.
- [ ] The production API/Web, database schema, permissions, readiness semantics, N33 manifest, and 16 fixed N33 cases remain unchanged.

## Validation commands

```text
node --check tests/evals/run-n33-eval.mjs
node tests/evals/run-n33-eval.mjs
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

For N33-R1, run `pnpm test:release-rehearsal` three consecutive times. Each run must report `api_smoke_cleanup`, `test_harness_e2e` with 3/3 tests, rollback validation, and schema/worktree cleanup as passed.

Production readiness must remain non-zero with `NOT_READY`; local_eval and rehearsal must retain zero exit codes. No temporary port, process, schema, or generated residue may remain.

## Exclusions and rollback

N33 does not add or modify production API, Web, database, permissions, readiness logic, dependencies, external integrations, model, Staff Identity, enterprise knowledge, deployment, production authorization, or a persistent evidence store. Rollback removes only N33 files and its package script entry and returns to `dc4fa06`.
