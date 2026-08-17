# N30 合成 local_eval/rehearsal 准入示例

> 本文件只描述 synthetic/local_eval/rehearsal 示例，不是正式业务输入包、生产配置、发布授权或部署凭证。它不能改变 production readiness。

## 示例决策记录

```yaml
businessInputPackage: SYNTHETIC-IT-SERVICE-DESK-001
businessOwnerRef: SYNTHETIC_BUSINESS_OWNER
finalApproverRef: SYNTHETIC_FINAL_APPROVER
knowledgeSourceRef: SYNTHETIC_REPOSITORY_FIXTURE
knowledgeVersion: SYNTHETIC_FIXTURE_V1
knowledgeEffectiveAt: SYNTHETIC_REHEARSAL_TIME
knowledgeOwnerRef: SYNTHETIC_KNOWLEDGE_OWNER
agentProviderRef: SYNTHETIC_DETERMINISTIC_LOCAL_PROVIDER
staffIdentityRef: SYNTHETIC_DENY_BY_DEFAULT_IDENTITY
deploymentTargetRef: SYNTHETIC_LOCAL_REHEARSAL
environmentTarget: SYNTHETIC_LOCAL_REHEARSAL
dataRetentionPolicyRef: SYNTHETIC_EPHEMERAL_TEST_ONLY
rollbackOwnerRef: SYNTHETIC_RELEASE_OWNER
rollbackPlanRef: SYNTHETIC_ROLLBACK_TO_LAST_ACCEPTED_COMMIT_AND_RERUN_SMOKE
confirmationStatus: SYNTHETIC_ONLY
productionReadiness: NOT_READY
contentSha256: SYNTHETIC_NOT_COMPUTED
canonicalSha256: SYNTHETIC_NOT_COMPUTED
```

## 使用边界

- 所有引用均为 synthetic 标识或现有 synthetic fixture 标识，只能用于本地评测和发布演练。
- `local_eval` 继续返回 `LOCAL_EVAL_READY`，`rehearsal` 继续返回 `REHEARSAL_READY`。
- `production` 必须继续返回 `NOT_READY` 及既有阻断原因；本示例不能解冻 N29，也不能启用正式模型、知识、Staff、部署或授权。
- 不得把本文件改写为正式业务输入，不得加入真实企业名称、人员、模型、凭证、客户数据或生产系统标识。
- 回滚示例是文档化演练步骤：回到最近已验收提交，再重新运行 smoke 和 rehearsal；不代表已经批准生产回滚。
