# N17 acceptance: LangGraph non-production workflow lab

## Single-node goal

Express the existing deterministic customer-service flow in an isolated LangGraph.js experiment without changing the production AgentPort, Nest module graph, APIs, database, or frontend.

## Acceptance criteria

- [x] The lab package uses the fixed flow `classify_request → retrieve_published → inspect_knowledge → terminal`.
- [x] Prompt injection and high-risk requests short-circuit before retrieval.
- [x] The retrieval port accepts only structured published/active fixture results; malformed or failed results fail closed to `mock_fallback`.
- [x] Retrieved knowledge containing an untrusted instruction never becomes an answer and routes to human handoff.
- [x] Normal knowledge answers preserve citations and the exact production `AgentResult` field set.
- [x] The experiment package does not import NestJS, Prisma, production AgentPort, real models, tracing, databases, or external systems.
- [x] LangGraph and LangChain Core are pinned `devDependencies` of `packages/langgraph-lab` only; they are not API/Web production dependencies.
- [x] The fixed N17 evaluation is offline, deterministic, synthetic-only, and included in `pnpm test:eval`.

## Dependency and resource record

- Direct packages: `@langchain/langgraph@1.4.9` and `@langchain/core@1.2.5`, both pinned in `packages/langgraph-lab/package.json` and `pnpm-lock.yaml`.
- `pnpm licenses list --filter @ai-agent/langgraph-lab` was run after installation. Direct LangChain packages and the inspected transitive runtime packages reported MIT; the complete development tree also contains permissive Apache-2.0, BSD, ISC, CC-BY-4.0, and MIT licenses.
- The package is dev-only and excluded from API/Web build scripts. The installed direct package directories measured about 7.6 MB for `@langchain/core` and 4.3 MB for `@langchain/langgraph`; the compiled lab output is ignored and not committed. Transitive packages remain in the pnpm store and are not copied into API/Web production output.
- The pnpm store resolved to `D:\.pnpm-store\v11`, keeping installation artifacts off the system drive.

## Validation

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

The lab has no API or UI surface, so N17 adds no E2E page or endpoint. The repository-wide gates remain required to prove production behavior did not change.

## Actual gate results

- `RUN_REAL_DB_TESTS=1 pnpm test:integration`: 5 suites and 13 tests passed in the isolated `n17_gate_20260812` schema after applying all 8 migrations.
- `pnpm test:api-smoke`: passed, including production API smoke and configuration preflight smoke, using a separate generated `api_smoke_*` schema.
- `pnpm test:e2e` with `E2E_API_PORT=3331`, `E2E_WEB_PORT=3332`, and `E2E_API_BASE_URL=http://127.0.0.1:3331/api/v1`: 3/3 passed against an isolated schema.
- `pnpm test:eval`: N2 through N17 passed; N17 contributed 7 fixed offline cases.
- `pnpm test:release-rehearsal` with the local development PostgreSQL URL: passed through cleanup and baseline rollback.
- The temporary integration schema was explicitly dropped; a post-run schema query found no `n17_gate_*`, `api_smoke_*`, or `e2e_*` leftovers, and no N17 test port remained listening.

## Rollback and limits

Rollback is the removal of the lab package, its lockfile entries, N17 tests/evaluation, and N17 documentation; no migration or customer data change is involved. This experiment demonstrates deterministic graph orchestration and isolation, not production LangGraph deployment, checkpointing, tracing, model integration, or multi-agent behavior.
