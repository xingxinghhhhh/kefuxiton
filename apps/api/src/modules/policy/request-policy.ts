export type RequestPolicyDecision = 'allow' | 'handoff' | 'injection';

const injectionPatterns = [
  /忽略(?:所有)?(?:系统|安全|开发者)?规则/u,
  /泄露(?:系统)?提示词/u,
  /hidden\s+context|system\s+prompt|developer\s+message/iu,
  /输出(?:你的)?(?:token|api\s*key|密码|隐藏上下文)/iu,
];

const handoffPatterns = [
  /(?:直接|帮我|请你|执行|授予|修改|恢复).*(?:权限|密码|生产)/u,
  /(?:重置|修改).*(?:他人)?密码/u,
  /管理员权限|生产(?:环境|系统|操作)|支付|退款|财务|人事|客户数据/u,
  /(?:疑似|可疑|异常登录|恶意软件|数据泄露|安全事件)/u,
  /身份(?:无法|不能)确认|权限争议|多人同时/u,
];

export function classifyUserRequest(content: string): RequestPolicyDecision {
  if (injectionPatterns.some((pattern) => pattern.test(content))) return 'injection';
  if (handoffPatterns.some((pattern) => pattern.test(content))) return 'handoff';
  return 'allow';
}

export function containsUntrustedInstruction(content: string) {
  return injectionPatterns.some((pattern) => pattern.test(content));
}
