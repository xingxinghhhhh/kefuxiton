# N38 验收记录

## 结论

N38 是只读的冻结基线回归确定性与漂移门禁，不新增业务功能或持久化证据。执行器连续两次从固定提交 `2b8a473` 创建独立临时本地 Clone，在 Clone 中叠加已接受的 N37 评测文件，运行未修改的 N37 evaluator，比较去除子进程原始输出后的安全摘要；两次摘要必须字节一致。每次运行结束时必须清理 Clone、N37 内部 worktree、依赖视图和生成物。

## 固定评测

9 条固定 case：`N38-BASELINE-COMMIT`、`N38-N36-CASE-COUNT`、`N38-N36-CASE-ALLOWLIST`、`N38-FIRST-RUN`、`N38-SECOND-RUN`、`N38-SUMMARY-DETERMINISM`、`N38-FILE-BOUNDARY`、`N38-CLEANUP`、`N38-OUTPUT-REDACTION`。

成功输出严格为：

```json
{"caseId":"...","status":"passed","reasonCode":"NONE"}
```

异常只允许输出：

```json
{"caseId":"N38-BOOTSTRAP","status":"failed","reasonCode":"N38_EVAL_FAILED"}
```

## 验收命令

```text
node --check tests/evals/run-n38-freeze-determinism.mjs
node tests/evals/run-n38-freeze-determinism.mjs
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

验收必须证明两次 fresh Clone 执行成功、两次安全摘要字节一致、固定基线仍为 `2b8a473`、N36 15/15 结果稳定、N37 文件未漂移、所有失败和敏感输出 fail-closed，且没有临时 Schema、端口、进程、依赖目录、Clone 或 worktree 残留。
