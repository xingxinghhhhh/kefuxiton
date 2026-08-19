# N39 验收记录

## 结论

N39 是只读的冻结回归链最终封存，不新增业务功能或持久化证据。它读取 N34–N38 的固定来源，生成并校验 `n39.v1` 最终 Manifest；只通过子进程调用一次 N38。N38 在独立 Clone 中自行执行两次 N37/N36 回归和清理，N39 不重复或绕过这些边界。

## 固定评测

16 条固定 case：`N39-CHAIN-ORDER`、`N39-N34-SOURCE`、`N39-N35-SOURCE`、`N39-N36-SOURCE`、`N39-N37-SOURCE`、`N39-N38-SOURCE`、`N39-COUNT-MATRIX`、`N39-READINESS-LOCAL-EVAL`、`N39-READINESS-REHEARSAL`、`N39-READINESS-PRODUCTION`、`N39-PRODUCTION-BLOCKERS`、`N39-PRODUCTION-FREEZE`、`N39-N38-INVOKE`、`N39-N38-DETERMINISM`、`N39-MANIFEST-EXACT-KEYS-DIGEST`、`N39-REDACTION-CLEANUP`。

Manifest 固定为 5 个节点：N34 18/0、N35 18/0、N36 15/0、N37 15/1、N38 9/2（`evalCount/repeatRuns`）。Production 始终为 `NOT_READY`，六个 blocker 顺序不变。

## 验收命令

```text
node --check tests/evals/run-n39-freeze-chain.mjs
node tests/evals/run-n39-freeze-chain.mjs
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

必须无敏感输出、路径、端口、Schema、进程、临时 Clone/worktree 或生成物残留；N34–N38 源文件和契约不得漂移。
