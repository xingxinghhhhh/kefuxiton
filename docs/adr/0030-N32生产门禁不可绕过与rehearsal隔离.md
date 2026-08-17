# ADR-0030：N32 生产门禁不可绕过与 rehearsal 隔离安全回归

## 状态

Proposed for local synthetic validation only. This decision does not authorize production deployment.

## 目标

在不提供任何真实生产资料的前提下，验证生产 API 的 fail-closed 边界和 rehearsal 的非生产隔离：

- production readiness 失败发生在 NestFactory、Prisma 初始化和端口监听之前；
- local_eval 与 rehearsal 继续保持可用，但不能被解释为 production ready；
- test Staff、知识发布开关和普通环境变量不能绕过 production 门禁；
- 启动失败输出不包含 Token、数据库连接串、路径、堆栈或客户内容。

## 范围与文件边界

本节点只允许修改：

- `tests/smoke/n32-production-boundary.mjs`
- `tests/evals/n32-production-boundary.json`
- `tests/evals/run-n32-eval.mjs`
- `docs/adr/0030-N32生产门禁不可绕过与rehearsal隔离.md`
- `docs/N32-acceptance.md`
- `docs/运行手册.md`
- 根 `package.json`：仅接入 N32 evaluator。

禁止修改生产源码、`packages/config`、N29–N31 文件、API 契约、数据库、权限、依赖和锁文件。

## 验证契约

N32 固定 12 条评测：production readiness 3 条、启动边界 2 条、绕过抵抗 3 条、脱敏 2 条、运行模式 2 条。所有评测结果只输出 `caseId`、`status`、`reasonCode`。

production 必须继续返回 `NOT_READY`、固定的六个 blocker，并以非零退出；production 启动不得监听端口。`local_eval` 与 `rehearsal` 分别继续返回 `LOCAL_EVAL_READY` 与 `REHEARSAL_READY`。rehearsal 继续使用 `APP_ENV=rehearsal`、deny-by-default Staff 和既有清理流程。

## 回滚与风险

回滚点为 N31 提交 `6dffde2`。失败时只删除 N32 新增文件和 package script 接入，不执行 reset、clean，不触碰既有 N29–N31 文件。该节点只增强本地回归证据，不改变生产 readiness、生产 API、数据库、权限、部署或外部服务行为。
