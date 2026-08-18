# N34 acceptance: synthetic verification final freeze

## Node goal

建立仅用于测试和文档的 `n34.v1` 最终冻结摘要，封存并核对 N29–N33-R1 的合成/local_eval/rehearsal 证据链。该节点不代表生产授权、上线批准或真实业务确认。

## Acceptance criteria

- [ ] `tests/evals/n34-freeze-manifest.json` 使用固定根字段顺序和 `n34.v1`。
- [ ] 节点顺序严格为 N29、N30、N31、N32、N33、N33-R1；评测数量为 15、14、14、12、16、0。
- [ ] `evidenceKind` 严格使用 ChatGPT 固定映射，所有 item 为 `ACCEPTED`，N33-R1 的 `rehearsalRuns` 为 3。
- [ ] 每个 evidence digest 使用固定安全摘要对象的紧凑 UTF-8 JSON 小写 SHA-256；manifest digest 排除自身并覆盖完整 manifest。
- [ ] Manifest 不超过 12 KiB，且不包含日志、客户内容、Token、连接串、路径、Prompt、堆栈或环境值。
- [ ] readiness 固定为 `LOCAL_EVAL_READY`、`REHEARSAL_READY`、`NOT_READY`；六个 production blocker 顺序不变。
- [ ] `productionFreeze.status=FROZEN`、`authorization=NOT_GRANTED`、`realInputs=NOT_AVAILABLE`。
- [ ] 固定 18 条 N34 评测全部通过；输出只有 `caseId`、`status`、`reasonCode`。
- [ ] N33-R1 摘要只记录三次 rehearsal、API smoke 清理、同 Schema E2E 3/3、rollback/schema/worktree 清理通过，不保存运行细节。
- [ ] N29–N33-R1 原文件、生产代码、readiness、API、Web、数据库、权限、依赖和锁文件未被修改。

## Validation commands

```text
node --check tests/evals/run-n34-eval.mjs
node tests/evals/run-n34-eval.mjs
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

`pnpm test:release-rehearsal` 必须连续执行 3 次。每次都必须报告 API smoke cleanup、同 Schema E2E 3/3、rollback validation、schema cleanup 和 baseline worktree cleanup 通过；不得遗留临时端口、进程、Schema、worktree 或生成物。

readiness 预期：`local_eval` 和 `rehearsal` 退出码为 0，`production` 退出码为 1 且状态为 `NOT_READY`，原因码保持六项固定顺序。

## Exclusions and rollback

N34 不接入真实模型、企业知识、Staff Identity、部署、外部系统或生产授权，不修改生产 API、Web、数据库、权限、readiness、依赖或锁文件，不建立持久化证据库。回滚点为 `dda673b`；失败时只删除 N34 文件和测试入口，不执行 `reset`、`clean` 或覆盖用户修改。
