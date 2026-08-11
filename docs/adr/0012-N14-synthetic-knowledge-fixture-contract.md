# N14：Synthetic 业务输入包与知识 Fixture 契约对齐

## 决策

确认的 `SYNTHETIC-IT-SERVICE-DESK-001 / synthetic-v1` 只用于本地开发和离线评测。manifest 与对应 Markdown fixture 必须共享 `sourceId`、`sourceRef`、`sourceStatus`、文档版本和规范化内容哈希。

知识内容哈希统一基于规范化后的完整 Markdown（去除 BOM、统一换行、清理行尾空白并保留一个末尾换行）。导入脚本在 readiness gate 通过后、访问数据库前校验 manifest 与目标 fixture 的路径和元数据；不一致直接以 `IDENTITY_NOT_READY` 拒绝。

## 边界

- `local_eval` 可以用于固定评测和发布演练输入。
- N12 的 published release rehearsal 使用独立的 synthetic rehearsal manifest；它不是确认的主业务输入，也不能作为生产授权。
- synthetic 输入永远不能得到 `PRODUCTION_READY`，也不构成真实企业审批。
- 不修改检索算法、分块参数、API、数据库、权限、模型供应商或前端。
- 客户引用继续只展示知识标题、版本、locator 和 chunk 哈希，不展示 manifest、审批引用或内部路径。

## 回滚

回滚到 N13 提交 `33e7a28`。本节点无数据库迁移；若契约对齐失败，应阻断导入并保留 local_eval 状态，不手工绕过哈希。
