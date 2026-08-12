# ADR-0016: N18 LangGraph non-production Human-in-the-loop interrupt and resume

## Status

Accepted as an isolated N18 experiment decision. This ADR does not authorize production adoption.

## Decision

Keep the N17 deterministic graph unchanged and add a separate Human-in-the-loop graph inside `packages/langgraph-lab`. The N18 graph uses the already pinned `@langchain/langgraph@1.4.9` exports `interrupt`, `Command`, `MemorySaver`, `StateGraph`, and `getState` to model a synthetic handoff pause and one controlled resume.

`MemorySaver` is instantiated only by the experiment session and its tests. It is process-local, non-persistent, and never connects to PostgreSQL, Redis, LangGraph Server, LangSmith, or an external service. The resume configuration uses a fixed synthetic `thread_id` supplied by the test or local evaluation caller.

The graph separates the pause payload from the final `AgentResult`. A pause returns `runStatus=paused`, a fixed `n18.v1` payload, and no result. A valid `approve_handoff` resumes to the existing handoff-compatible result. A valid `deny_handoff` records the internal `safe_refusal` outcome but maps to the existing `safe_unavailable` result without changing `packages/contracts` or production `AgentPort`. Missing, malformed, duplicate, or stale resumes fail closed with fixed experiment error codes.

The state contains only synthetic request text, structured policy/retrieval values, fixed pause metadata, a constrained human decision, status, outcome, error code, and the existing compatible result. It must not contain credentials, customer identity, operator identity, free-form human text, Prisma/Nest objects, hidden prompts, raw customer sessions, real timestamps, or external identifiers. Interrupt payloads never include the original request text.

## Boundary and alternatives

N17 deliberately has no checkpointer and remains unchanged. N18 introduces a checkpointer only for the separate lab graph so that the API behavior can be tested without production persistence. A production handoff workflow, customer-facing resume API, identity binding, database checkpointing, model call, tool call, or high-risk write operation is explicitly deferred and requires a separate approved node.

## Verification and rollback

N18 has deterministic Jest coverage for initial pause, payload shape, approve/deny resume, missing/invalid input, duplicate/stale resume, unsafe knowledge pause, injection short-circuit, normal answer, no match, retrieval failure, and N17/N18 source isolation. The fixed N18 evaluation contains 12 cases and is included in `pnpm test:eval` through `pnpm test:langgraph-lab`.

Rollback is removal of the N18 files, the root evaluation command addition, and this ADR/acceptance/runbook documentation. No migration, production data, production configuration, or API contract rollback is required.
