# N18 acceptance: LangGraph non-production Human-in-the-loop interrupt and resume

## Single-node goal

Use LangGraph interrupt/resume semantics in an isolated lab graph to simulate a synthetic request pausing for human review and continuing only after a constrained human decision. N17's graph and all production packages remain unchanged.

## Acceptance criteria

- [x] `interrupt`, `Command({ resume })`, `MemorySaver`, a stable `thread_id`, and `getState` are used with the locked LangGraph 1.4.9 API.
- [x] The N18 graph is separate from the N17 graph; N17 remains uncheckpointed.
- [x] Handoff and unsafe published knowledge requests pause with a fixed `n18.v1` payload and no `AgentResult`.
- [x] `approve_handoff` resumes to a handoff-recommended result without generating a knowledge answer.
- [x] `deny_handoff` records internal `safe_refusal` and maps to the existing `safe_unavailable` response type without changing shared contracts.
- [x] Missing, structurally invalid, duplicate, and stale resumes fail closed with fixed error codes.
- [x] Prompt injection, normal published knowledge, no-match, and retrieval failure paths preserve safe N17-compatible behavior.
- [x] The experiment uses only synthetic/in-memory data and imports no NestJS, Prisma, production AgentPort, model, tracing, database, or external service.
- [x] The fixed N18 evaluation has 12 cases and is included in `pnpm test:eval`.

## Changed files

- `packages/langgraph-lab/src/hitl-state.ts`: N18 state, pause payload, decision validation, statuses, outcomes, and error codes.
- `packages/langgraph-lab/src/hitl-graph.ts`: isolated graph nodes and fixed edges.
- `packages/langgraph-lab/src/hitl-resume.ts`: in-memory session wrapper, checkpoint status checks, resume mapping, and safe result mapping.
- `packages/langgraph-lab/src/hitl-result-mapper.ts`: N18 terminal result aliases using the existing result contract.
- `packages/langgraph-lab/test/hitl-interrupt.spec.ts`, `hitl-resume.spec.ts`, `n17-n18-boundary.spec.ts`: deterministic interrupt/resume and isolation tests.
- `tests/evals/n18-langgraph-human-review.json`, `tests/evals/run-n18-eval.mjs`: 12 fixed offline cases and static boundary checks.
- `package.json`: runs the N18 evaluation from `pnpm test:langgraph-lab`.
- `docs/adr/0016-N18-langgraph-human-in-the-loop.md`, this acceptance record, and `docs/运行手册.md`.

## API and data boundary evidence

The installed locked package exports `interrupt`, `Command`, `MemorySaver`, `Annotation`, `StateGraph`, `START`, and `END`. A minimal local runtime probe confirmed that `interrupt` returns a `__interrupt__` payload, `getState` reports the paused next node, and the same `thread_id` resumes successfully with `Command({ resume })`.

N18 `MemorySaver` is process-local only. It is not a customer-data store, does not provide production recovery, and is not reachable from the API or Web packages. No raw request text is included in the interrupt payload or evaluation output.

## Validation commands and results

Required commands:

```text
pnpm --filter @ai-agent/langgraph-lab typecheck
pnpm --filter @ai-agent/langgraph-lab build
pnpm test:langgraph-lab
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:api-smoke
pnpm test:e2e
pnpm test:eval
pnpm build
pnpm verify
pnpm test:release-rehearsal
```

The final executed results are:

- Lab typecheck/build: passed.
- N18 lab tests: 6 suites / 16 tests passed; N17 tests remain green.
- N17 fixed evaluation: 7 cases passed.
- N18 fixed evaluation: 12 cases passed.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`: passed; unit gate reported 9 suites and 24 tests passed with 2 database suites skipped by default.
- `RUN_REAL_DB_TESTS=1 pnpm test:integration`: 5 suites / 13 tests passed in isolated schema `n18_gate_20260812`; the schema was explicitly dropped after the run.
- `pnpm test:api-smoke`: production API smoke and configuration preflight smoke passed using generated isolated schema; generated schema was cleaned.
- `pnpm test:e2e` with isolated ports 3331/3332: 3/3 passed; generated E2E schema and processes were cleaned.
- `pnpm test:eval`: N2 through N18 passed.
- `pnpm build`: API and Web production builds passed; the lab was not added to production build scripts.
- `pnpm verify`: passed with 48 base files and 8 role files.
- `pnpm test:release-rehearsal`: passed through baseline rollback and cleanup.
- Post-run checks found no `n18_gate_*`, `api_smoke_*`, `e2e_*`, or `release_rehearsal_*` schemas and no test process listening on ports 3331, 3332, or 3341.

## Rollback and limits

Rollback is removal of the N18 lab files, evaluation entry, and documentation. No migration, database schema, customer data, production API, or production frontend rollback is involved. N18 proves in-memory interrupt/resume orchestration only; it does not prove production persistence, identity authorization, customer-facing handoff APIs, model integration, or high-risk operation approval.
