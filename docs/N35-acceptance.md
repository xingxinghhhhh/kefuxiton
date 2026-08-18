# N35 验收记录

## 结论

N35 的验收对象是合成知识包三态边界，不是生产上线授权。验收通过的必要条件是 18/18 评测通过，local_eval 不可检索，rehearsal 能回答并返回真实知识引用，production 在数据库写入和监听前失败，测试资源全部清理。

## 评测清单

固定 18 条：

`N35-PACKAGE-ID`、`N35-SOURCE-ID`、`N35-SOURCE-STATUS`、`N35-CONTENT-HASH`、`N35-CANONICAL-HASH`、`N35-LOCAL-EVAL-IMPORT`、`N35-LOCAL-EVAL-NOT-PUBLISHED`、`N35-LOCAL-EVAL-NOT-RETRIEVABLE`、`N35-LOCAL-EVAL-CLEANUP`、`N35-REHEARSAL-IMPORT`、`N35-REHEARSAL-KNOWLEDGE-ANSWER`、`N35-REHEARSAL-CITATION`、`N35-REHEARSAL-SAFE-BOUNDARY`、`N35-PRODUCTION-READINESS-REJECT`、`N35-PRODUCTION-NO-DB-WRITE`、`N35-PRODUCTION-NO-LISTEN`、`N35-OUTPUT-REDACTION`、`N35-RESOURCE-CLEANUP`。

## 运行

```text
node --check tests/smoke/n35-synthetic-knowledge-modes.mjs
node --check tests/evals/run-n35-eval.mjs
node tests/evals/run-n35-eval.mjs
```

运行 smoke/eval 前必须提供仅用于本地测试的 `DATABASE_URL`。完整节点还必须运行仓库统一门禁、API smoke 和 release rehearsal；production readiness 仍应为 `NOT_READY`。

## 安全证据

- local_eval fixture 可写入隔离 Schema，但 `KnowledgeService.retrieve()` 只读取 published，因此返回空结果和空引用。
- rehearsal fixture 通过既有导入器进入唯一隔离 Schema；API 返回 `knowledge_answer`，引用包含版本、locator、内容哈希和 `knowledge://` URI。
- 未知/注入请求不产生知识引用，注入请求进入人工建议边界。
- production 发布和 API 启动均在 Prisma/监听前被拒绝；前后知识表计数不变。
- 不输出数据库 URL、绝对路径、Token、密码、Secret、客户原文或堆栈；finally 删除 Schema 和子进程。
