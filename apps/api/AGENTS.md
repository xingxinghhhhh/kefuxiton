# 后端 API 规则

本规则继承仓库根目录 `AGENTS.md`，适用于 `apps/api` 及其后端代码。

## 后端分层

每个业务模块优先采用：

```text
module/
├── presentation/       Controller、DTO、序列化和鉴权入口
├── application/        用例、事务编排和权限判断
├── domain/              实体、值对象、领域规则和端口
├── infrastructure/     Prisma repository、外部 API、队列和适配器
└── module.ts
```

小模块可以合并目录，但不得把所有业务逻辑堆在 Controller 或 Service 巨型文件中。

## API 规则

- Controller 只负责协议适配、鉴权入口、参数校验和调用用例，不写业务决策。
- API 必须有明确的请求 DTO、响应 DTO、错误码和 OpenAPI 文档。
- 错误响应统一结构，不能把 Prisma、第三方 SDK 或堆栈直接返回给客户端。
- 分页、排序、过滤、幂等键、关联 ID 和时间格式必须在接口层统一。
- 破坏性变化必须增加版本或兼容层，不能静默改变旧字段含义。
- 所有外部输入都要校验；校验通过不代表拥有业务权限。

## 数据库与事务

- Prisma 只能在 repository/infrastructure 层使用；领域层不得依赖 Prisma 类型。
- 迁移必须可重复审查，字段删除或重命名必须先做兼容迁移和数据验证。
- 会话状态、人工接管、工具调用和知识发布的多步变更必须明确事务边界。
- 需要重试的操作必须具备幂等键；不得用“先查再写”代替唯一约束。
- 禁止在启动时偷偷改库、自动删除数据或执行不可逆数据修复。
- 生产数据库操作必须有备份、回滚和演练说明。

## AI Provider 与外部系统

所有外部 AI/知识库/客服工作台/业务系统通过端口接入：

```ts
interface AiProvider { generate(input: AgentInput): Promise<AgentOutput>; }
interface RetrievalProvider { retrieve(input: RetrievalInput): Promise<RetrievalResult[]>; }
interface ReadonlyBusinessTool { execute(input: unknown, context: ToolContext): Promise<ReadonlyToolResult>; }
```

- 领域层依赖接口，不依赖 Dify/FastGPT/MaxKB/具体模型 SDK。
- Provider 必须统一超时、重试、限流、错误映射、日志脱敏和追踪 ID。
- 工具注册采用显式白名单；禁止模型根据字符串动态调用任意 URL、SQL 或函数。
- 只读工具必须在代码和配置两处标明 read-only；没有该标记不得注册。
- 工具返回的不确定状态不能被包装成成功答案。

## 日志、审计与测试

- 每个请求、Agent run、检索、工具调用和人工接管都要带关联 ID。
- 业务日志与审计日志分开；审计记录操作者、对象、动作、结果、版本和时间。
- 日志只记录必要摘要，不记录秘密和未脱敏完整客户内容。
- 外部调用至少记录 provider、版本、耗时、结果类别和失败原因。
- 失败必须有可定位错误码，禁止只返回“系统异常”。
- 每个用例按适用性覆盖成功、参数错误、未授权、无资源、依赖失败和幂等重复。
- domain 不接数据库和网络；application 使用 fake repository/provider；infrastructure 使用真实测试数据库或隔离容器；API 使用 Supertest/HTTP 集成测试；工具覆盖越权输入、超时、空结果、异常结果和重复调用；迁移至少有空库部署和升级 smoke。
