# N36 验收记录

## 结论

N36 是非生产主线的只读封存维护节点，不新增业务功能或持久化证据包。验收要求 15/15 评测通过，N34 冻结 Manifest 未漂移，N35 三态评测仍完整通过，production 仍为 `NOT_READY`。

## 固定评测

15 条固定 case：

`N36-N34-EXACT-KEYS`、`N36-N34-NODE-ORDER`、`N36-N34-ITEM-COUNTS`、`N36-N34-DIGEST`、`N36-FREEZE-STATUS`、`N36-FREEZE-AUTHORIZATION`、`N36-FREEZE-REAL-INPUTS`、`N36-READINESS-LOCAL-EVAL`、`N36-READINESS-REHEARSAL`、`N36-READINESS-PRODUCTION`、`N36-PRODUCTION-BLOCKERS`、`N36-N35-TRI-MODE`、`N36-N35-REGRESSION`、`N36-FILE-BOUNDARY`、`N36-OUTPUT-REDACTION`。

成功输出严格为：

```json
{"caseId":"...","status":"passed","reasonCode":"NONE"}
```

评测自身异常严格为：

```json
{"caseId":"N36-BOOTSTRAP","status":"failed","reasonCode":"N36_EVAL_FAILED"}
```

## 验收命令

```text
node --check tests/evals/run-n36-eval.mjs
node tests/evals/run-n36-eval.mjs
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

并确认 readiness：local_eval 退出码 0、rehearsal 退出码 0、production 退出码 1 且状态 `NOT_READY`；无 Schema、端口、进程和临时 worktree 残留。
