# N42 非生产客服工作台体验增强验收

## 结论

N42 只增强 `apps/web` 的客户对话和 Staff 接管工作台体验，复用现有 API、共享契约、认证和审计投影，不新增后端业务能力。节点评测固定为 8 个场景，成功标记为 `N42_ACCEPTED`。

本节点仅允许 synthetic、`local_eval` 和 rehearsal 数据。它不接入真实模型、知识源、Staff 身份或生产部署，也不改变 N29–N41 的生产冻结结论：production 仍为 `NOT_READY`。

## 变更边界

- 客户端：消息状态、引用卡片、安全拒答、转人工等待、反馈状态、快捷问题和安全边界说明。
- Staff：接管队列、请求摘要、内部上下文、审计时间线、反馈审计事件、人工回复和关闭接管。
- 安全：客户和 Staff 入口分离；客户不渲染 Token、内部备注或审计元数据；Staff 只展示服务端脱敏投影；生产身份默认拒绝。
- 未修改：API、DTO/OpenAPI、Prisma、迁移、数据库、权限规则、模型/检索/知识策略和生产 readiness。

## 固定评测

执行 `node tests/evals/run-n42-eval.mjs`，必须得到 8 个 `passed` 事件和最终 `N42_ACCEPTED`。固定场景覆盖客户消息、引用、保守拒答、转人工、反馈、Staff 队列与详情、时间线脱敏以及角色隔离/生产拒绝。

## 浏览器验收

Playwright 覆盖客户安全 Mock 对话、刷新恢复、反馈记录、转人工停用输入、Staff 错误 Token、接管、回复、内部备注、标签、反馈审计和关闭接管。新增角色隔离断言确保客户页没有 Staff Token 输入，Staff 页没有客户消息输入。

## 验证与回滚

节点门禁：

```text
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

回滚只删除或反转 N42 变更，恢复到 `762e595` 的冻结文档和代码状态；不得使用 `reset --hard`、`clean` 或覆盖其他用户修改。
