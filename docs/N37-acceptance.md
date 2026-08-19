# N37 验收记录

## 结论

N37 是只读的非生产冻结基线回归，不新增业务功能或持久化证据。验收要求 15/15 评测通过，N34 Manifest、N35/N36 评测和 readiness 状态均未漂移。执行器会在固定提交 `2b8a473` 创建临时 detached worktree，在其中运行未修改的 N36 evaluator；依赖视图、Prisma 生成物和构建产物只存在于该临时 worktree，结束时必须自动清理。

## 固定评测

15 条固定 case：

`N37-N34-EXACT-KEYS`、`N37-N34-NODE-ORDER`、`N37-N34-DIGEST`、`N37-N34-FREEZE`、`N37-N35-CASE-COUNT`、`N37-N35-CASE-ALLOWLIST`、`N37-N35-OUTPUT-CONTRACT`、`N37-N36-CASE-COUNT`、`N37-N36-CASE-ALLOWLIST`、`N37-N36-OUTPUT-CONTRACT`、`N37-READINESS-LOCAL-EVAL`、`N37-READINESS-REHEARSAL`、`N37-READINESS-PRODUCTION`、`N37-FILE-BOUNDARY`、`N37-OUTPUT-REDACTION`。

成功输出严格为：

```json
{"caseId":"...","status":"passed","reasonCode":"NONE"}
```

评测自身异常严格为：

```json
{"caseId":"N37-BOOTSTRAP","status":"failed","reasonCode":"N37_EVAL_FAILED"}
```

## 验收命令

N36 基线托管成功时允许额外输出一条安全汇总：

```json
{"caseId":"N37-N36-BASELINE-RUN","status":"passed","reasonCode":"NONE"}
```

```text
node --check tests/evals/run-n37-freeze-regression.mjs
node tests/evals/run-n37-freeze-regression.mjs
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

readiness 必须为：local_eval 退出码 0、rehearsal 退出码 0、production 退出码 1 且状态 `NOT_READY`。验收后不得有临时 Schema、端口、进程或 worktree 残留；执行器不得修改当前工作树的源码、依赖链接或生成物。
