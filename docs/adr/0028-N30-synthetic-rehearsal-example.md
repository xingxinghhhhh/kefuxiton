# ADR-0028：N30 合成演练准入示例

## 状态

Accepted for synthetic/local_eval/rehearsal documentation and offline evaluation only.

## 决策

仓库允许记录一组明确标记为 `SYNTHETIC_` 的本地评测和发布演练示例，用于补齐文档、离线评测和演练记录。示例不构成正式业务事实、供应商确认、身份授权、部署批准或生产发布输入。

生产 readiness 继续保持 `NOT_READY`，既有六个生产阻断原因、N29 待确认模板和 readiness evaluator 均不改变。示例不能打开知识发布、启用正式模型或 Staff Identity，也不能把 local_eval/rehearsal 升级成 production。

## 允许修改范围

- `docs/examples/N30-synthetic-rehearsal-decision.md`
- 本 ADR
- `docs/N30-acceptance.md`
- `tests/evals/n30-synthetic-decision.json`
- `tests/evals/run-n30-eval.mjs`
- 根 `package.json`：仅接入 N30 evaluator

不得修改 `packages/config`、N29 模板、readiness evaluator、生产 API、Web、数据库、contracts、依赖或锁文件。

## 回滚

删除 N30 示例、ADR、验收说明和评测接入，回到 `1bf8d01`。不需要数据迁移、生产回滚或客户数据处理。
