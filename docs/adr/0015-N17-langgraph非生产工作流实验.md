# ADR-0015：N17 LangGraph 非生产工作流实验

## 状态

Accepted for the N17 isolated experiment.

## 决策

新增 `packages/langgraph-lab`，以 LangGraph.js `StateGraph` 表达固定的确定性客服流程：安全检查、已发布知识检索、知识安全检查和回答/拒答/转人工终态。实验包只将 `@langchain/langgraph` 与 `@langchain/core` 作为固定版本 `devDependencies`，不进入 `apps/api`、`apps/web` 或生产构建，不修改生产 `AgentPort`/`AgentModule`。

实验图通过 `PolicyClassifier`、`KnowledgeRetriever` 和 `KnowledgeSafetyChecker` 注入纯端口。它不导入 NestJS、Prisma、生产 AgentPort，不创建数据库连接，不访问网络，不接入真实模型、企业知识、身份、LangSmith、checkpointer 或外部系统。测试使用 synthetic/local_eval fixture，并覆盖注入、越权转人工、无命中、知识注入、正常回答、检索异常和非法端口输出。

## 依据与替代方案

保留当前生产确定性适配器作为唯一生产实现，避免为了框架名称改写已验证的安全链路。将 LangGraph 作为独立 dev-only 实验可获得 StateGraph、节点、条件边和编译执行的实战，同时把生产依赖、构建体积和回滚范围限制在实验包。替代方案是纯 TypeScript 手写状态机；本节点选择 LangGraph 是为了验证可替换的编排适配器，而不是授权生产接入。

## 许可证与资源

LangGraph.js 官方仓库标注 MIT；安装后通过 `pnpm licenses list --filter @ai-agent/langgraph-lab` 检查直接和传递依赖，记录见 `docs/N17-acceptance.md`。依赖固定进入锁文件，实验包安装体积和编译产物不进入 API/Web 生产构建。pnpm store 位于 `D:\.pnpm-store\v11`。

## 回滚

回滚到 N16 提交 `338e334`，只移除实验包、锁文件依赖、N17 评测和文档；不需要数据库迁移、数据删除或生产配置回滚。
