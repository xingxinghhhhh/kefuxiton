# ADR-0031：N33 合成/rehearsal 安全证据最终封存

## 状态

Proposed for synthetic/local_eval/rehearsal evidence only. This decision does not authorize production deployment.

## 决策

N33 使用测试/文档内部的 `n33.v1` manifest，只汇总并校验 N29–N32 已审查的安全摘要，不保存原始文档、完整评测输出、路径、环境变量、Token、客户内容或持久化证据。

根字段顺序固定为：

`schemaVersion`、`evidenceType`、`nodeOrder`、`expectedNodeCount`、`items`、`readiness`、`productionBlockers`、`syntheticOnly`、`productionIntegration`、`manifestDigest`。

固定结论为：节点顺序 `N29,N30,N31,N32`；评测数量 `15/14/14/12`；`local_eval=LOCAL_EVAL_READY`、`rehearsal=REHEARSAL_READY`、`production=NOT_READY`；`syntheticOnly=true`；`productionIntegration=false`。摘要使用排除自身后的固定字段顺序紧凑 UTF-8 JSON 和小写 SHA-256 64 位十六进制。

## 文件边界

仅允许修改：

- `tests/evals/n33-evidence-manifest.json`
- `tests/evals/run-n33-eval.mjs`
- `docs/adr/0031-N33合成rehearsal安全证据最终封存.md`
- `docs/N33-acceptance.md`
- `docs/运行手册.md`
- 根 `package.json`：仅接入 N33 eval。

不得修改 N29–N32 原文件、readiness evaluator、生产源码、API、Web、数据库、权限、依赖、锁文件或正式准入信息。

## 评测与安全

固定评测共 16 条：节点顺序/状态/数量 4 条、三种 readiness 3 条、blocker 顺序 1 条、合成/生产边界 3 条、manifest exact-key/字段顺序/digest 2 条、篡改/缺失/未知字段 fail-closed 2 条、既有入口接入 1 条。评测失败只输出 `caseId`、`status`、`reasonCode`。

N33 不新增生产 API、Web、数据库、权限、运行时能力、外部服务或持久化证据库，也不改变 production readiness。

## 回滚

回滚点为 N32 提交 `dc4fa06`。失败时只删除 N33 manifest、评测、文档和 package script 接入，不执行 `reset`、`clean`，不触碰 N29–N32。

## N33-R1 修订：同 Schema API smoke/E2E 状态隔离

### 状态

Accepted only after the release rehearsal gate passes. This amendment remains synthetic/test-only and does not change the N33 manifest or its 16 fixed evaluation cases.

### 修订范围

为修复 `API smoke → 同一 release_rehearsal schema 的 E2E` 顺序污染，仅允许修改：

- `tests/smoke/api-production.mjs`
- `scripts/run-release-rehearsal.mjs`
- 本 ADR、`docs/N33-acceptance.md` 和 `docs/运行手册.md`

API smoke 记录无内容的业务关系基线，并只清理本次创建的 conversation 及其白名单级联关系：message feedback、operator reply、internal note、conversation tag、audit event、message、handoff request、conversation。删除顺序遵守现有外键依赖；不使用 `TRUNCATE`、`migrate reset`、公共 schema 清理或无范围删除。published synthetic knowledge fixture 保留。

`run-release-rehearsal.mjs` 在 E2E 启动前重新计算关系摘要并与 API smoke 前的 rehearsal 基线比较；不一致或清理失败即 fail closed。测试仍按原顺序运行 API smoke 和同一 schema 的 E2E，不通过更换 schema、跳过测试或放宽断言规避问题。

### 明确排除

N33-R1 不修改生产 API/Web/数据库模型/权限/readiness/依赖，不接入真实模型、知识、Staff Identity、部署或外部系统，不改变 production `NOT_READY`，不删除 N33 manifest 或既有评测语义。
