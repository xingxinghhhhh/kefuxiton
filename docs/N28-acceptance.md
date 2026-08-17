# N28 acceptance: LangGraph experiment freeze and pre-production decision package

## Single-node goal

Create a read-only, non-production decision package that proves N17–N27 remain regression-covered, production remains `NOT_READY`, and the LangGraph experiment package is absent from the API/Web/contracts/config production dependency and build boundaries.

## Fixed decision

- `local_eval` remains `LOCAL_EVAL_READY`.
- `rehearsal` remains `REHEARSAL_READY`.
- `production` remains `NOT_READY` with the fixed reasons `BUSINESS_NOT_PRODUCTION_READY`, `KNOWLEDGE_SOURCE_NOT_APPROVED`, `SYNTHETIC_NOT_PRODUCTION`, `STAFF_IDENTITY_NOT_CONFIGURED`, `AGENT_PROVIDER_NOT_CONFIGURED`, and `DEPLOYMENT_TARGET_NOT_CONFIGURED`.
- N25 keeps the exact nine-field `EvidenceGateSnapshot`; N27 keeps 18 fixed cases.
- The experiment package is not imported by production sources or package manifests, and the root production build excludes it.

## Pending owner decisions

The repository intentionally records these as pending and contains no real values: formal business input and approval, approved knowledge source and owner/version/effective time, formal model/provider, formal Staff identity adapter, deployment target, data retention period, and production rollback owner/strategy. Missing decisions keep production `NOT_READY`.

## Acceptance criteria

- [ ] Fixed N28 evaluation contains exactly 21 cases: readiness 10, production isolation 5, contract preservation 3, safety 3.
- [ ] The evaluator reuses the existing readiness CLI and does not copy its decision logic.
- [ ] The evaluator is read-only, has no external service call, and emits only `caseId`, `status`, and `reasonCode`.
- [ ] API, Web, config, and contracts production boundaries contain no LangGraph/LangChain/MemorySaver marker or dependency.
- [ ] N25 nine-field and N27 18-case contracts remain unchanged.
- [ ] N17–N27 evaluation chain remains connected through `pnpm test:langgraph-lab` and `pnpm test:eval`.
- [ ] No credentials, customer data, prompt/token values, absolute local paths, or exception stacks are included.

## Validation commands

```text
pnpm --filter @ai-agent/langgraph-lab typecheck
pnpm --filter @ai-agent/langgraph-lab build
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

The production readiness command must exit non-zero with `NOT_READY`; the other two targets must preserve their existing successful results. Verify that no temporary schema, test process, port, or generated artifact remains.

## Limits and rollback

N28 adds no production runtime capability, API, UI, dependency, migration, environment variable, external integration, or `n28.v1` schema. Rollback returns to `9897f76` without database or production rollback.
