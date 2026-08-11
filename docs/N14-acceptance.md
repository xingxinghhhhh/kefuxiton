# N14 验收记录

## 节点结论

Synthetic IT 服务台输入已与实际 Markdown fixture 对齐，状态仍为 `LOCAL_EVAL_READY`；生产目标仍为 `NOT_READY`。

## 固定验收

- manifest 与 fixture 的 source、版本、状态和规范化内容哈希一致。
- manifest canonical hash 通过校验。
- 目标 fixture 不一致时，在数据库访问前返回 `IDENTITY_NOT_READY`。
- 生产 readiness 继续包含 `SOURCE_NOT_APPROVED` 和 `SYNTHETIC_NOT_PRODUCTION`。
- N12 的 published 演练 fixture 使用独立 manifest，不绕过主业务输入包与 fixture 的身份校验。

## 验证命令

`node tests/evals/run-n14-eval.mjs`

完整门禁由仓库根目录的 `pnpm lint`、`pnpm typecheck`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:api-smoke`、`pnpm test:e2e`、`pnpm test:eval`、`pnpm build`、`pnpm test:release-rehearsal` 和 `pnpm verify` 覆盖。
