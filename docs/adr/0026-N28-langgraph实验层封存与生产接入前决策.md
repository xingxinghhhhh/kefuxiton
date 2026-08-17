# ADR-0026：N28 LangGraph 实验层封存与生产接入前决策

## 状态

已批准的非生产封存节点。

## 决策

N28 形成一个只读、非生产的决策包，汇总 N17–N27 已通过的离线证据，并固定生产接入前仍缺失的负责人决策。该节点不新增运行时对象、公共契约、数据库对象、持久化文件或生产能力。

生产状态继续由 `packages/config/src/release-readiness.ts` 的现有 evaluator 派生。当前 `production` 必须返回 `NOT_READY`，原因码保持既有顺序：

`BUSINESS_NOT_PRODUCTION_READY`、`KNOWLEDGE_SOURCE_NOT_APPROVED`、`SYNTHETIC_NOT_PRODUCTION`、`STAFF_IDENTITY_NOT_CONFIGURED`、`AGENT_PROVIDER_NOT_CONFIGURED`、`DEPLOYMENT_TARGET_NOT_CONFIGURED`。

`local_eval` 和 `rehearsal` 的既有结果分别保持 `LOCAL_EVAL_READY` 和 `REHEARSAL_READY`。环境变量只能选择运行模式，不能声明正式模型、正式 Staff 身份、正式知识来源或部署目标。synthetic/local_eval、deny/test Staff 和 deterministic Agent 不能被解释为 production ready。

## 生产隔离

`packages/langgraph-lab` 是独立实验包，LangGraph/LangChain 只存在于其开发依赖和离线实验链。`apps/api`、`apps/web`、`packages/config`、`packages/contracts` 的源码与 package manifest 不依赖实验包；根生产 `build` 只构建这四个生产包。N28 以固定静态评测证明这一边界，失败时退出非零且不输出源码路径、片段或堆栈。

N25 `EvidenceGateSnapshot` 继续保持九字段，N27 的 18 条评测继续接入；N28 不增加 `n28.v1`，不复制 readiness evaluator，也不修改 N20–N27 契约。

## 待负责人确认的生产前置条件

以下事项只能记录为未确认，不能填写真实值：

- 正式业务输入包及最终审批；
- 正式知识来源、责任人、版本和生效时间；
- 正式模型/Agent Provider；
- 正式 Staff Identity 适配器；
- 正式部署目标；
- 数据保留周期；
- 生产回滚负责人和回滚策略。

这些条件缺失时，生产状态必须保持 `NOT_READY`。

## 验证与回滚

N28 固定 21 条离线评测：readiness 10 条、生产依赖/构建隔离 5 条、N25/N27 契约保持 3 条、敏感信息和外部副作用边界 3 条。评测只输出 `caseId`、`status`、`reasonCode`。

回滚点为 `9897f76`。回滚只删除 N28 的评测、根脚本接入和文档，恢复 N27 的测试链；不执行数据库、生产配置或外部系统操作。
