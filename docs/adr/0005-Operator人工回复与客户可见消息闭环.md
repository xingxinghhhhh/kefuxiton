# ADR-0005：Operator 人工回复与客户可见消息闭环

## 状态

已实施，等待 ChatGPT 节点审核。

## 决策

在 N4 `requested -> claimed -> closed` 队列和权限边界上，增加仅由当前 `claimedBy` Operator 发送的公开人工回复：

```text
claimed Operator -> OperatorReply + Message -> customer /chat refresh
```

人工消息继续使用现有 `Message.role=agent` 兼容旧客户端，并通过 `senderType=human_operator`、`responseType=human_reply` 和 `agentMode=human_operator` 明确来源。人工回复不进入 AgentPort，也不会恢复 AI 自动回复。

## 数据与幂等

- `Message.senderType` 为增量可空字段，旧数据按 `user=customer`、`agent=ai` 兼容映射。
- `OperatorReply` 关联一个 Message、一个 HandoffRequest 和一个 Operator。
- `(handoffRequestId, idempotencyKey)` 唯一；重复提交返回原回复和原消息，不创建第二条公开消息。
- 回复、关联记录和首次/重放审计在同一事务中完成。

## 安全边界

- Staff 回复复用 N4 Staff 身份，新增 `handoff:reply` 权限。
- 只有当前 `claimedBy` Operator 可回复；requested/closed、客户 Bearer 和其他 Operator 均拒绝。
- 客户读取接口只按自身 Bearer 会话返回公开消息，不返回 Operator ID、审计 metadata 或内部路径。
- 回复正文不写入审计 metadata；不接入外部系统或业务写工具。

## 回滚

回滚到 N4 提交 `0ba448b`；保留 `OperatorReply`、人工消息和审计记录，不删除历史。旧版本继续提供 N4 队列、claim、close 和 AI 抑制。
