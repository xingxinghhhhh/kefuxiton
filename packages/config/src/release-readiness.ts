import type { AppEnvironment, RuntimeConfig, StaffAuthMode } from './index.js';
import type { BusinessReadinessReport } from './business-readiness.js';

export type ReleaseReadinessTarget = 'local_eval' | 'rehearsal' | 'production';
export type KnowledgeCapability = 'synthetic_local_eval' | 'published';
export type AgentCapability = 'deterministic_local_eval' | 'provider';
export type StaffCapability = 'deny' | 'test' | 'identity_provider';
export type ReleaseReadinessStatus = 'LOCAL_EVAL_READY' | 'REHEARSAL_READY' | 'PRODUCTION_READY' | 'NOT_READY';

export type ReleaseReadinessReasonCode =
  | 'CONFIG_INVALID'
  | 'MODE_CONFLICT'
  | 'BUSINESS_INPUT_NOT_READY'
  | 'BUSINESS_NOT_PRODUCTION_READY'
  | 'KNOWLEDGE_SOURCE_NOT_APPROVED'
  | 'SYNTHETIC_NOT_PRODUCTION'
  | 'STAFF_IDENTITY_NOT_CONFIGURED'
  | 'AGENT_PROVIDER_NOT_CONFIGURED'
  | 'DEPLOYMENT_TARGET_NOT_CONFIGURED';

export interface ReleaseCapabilities {
  knowledge: KnowledgeCapability;
  agent: AgentCapability;
  staff: StaffCapability;
  deploymentConfigured: boolean;
}

export interface ReleaseReadinessInput {
  target: ReleaseReadinessTarget;
  appEnv: AppEnvironment;
  configValid: boolean;
  businessReadiness: BusinessReadinessReport | null;
  capabilities: ReleaseCapabilities;
}

export interface ReleaseReadinessReport {
  status: ReleaseReadinessStatus;
  target: ReleaseReadinessTarget;
  reasonCodes: ReleaseReadinessReasonCode[];
}

export const CURRENT_RELEASE_CAPABILITIES: Readonly<Pick<ReleaseCapabilities, 'knowledge' | 'agent' | 'deploymentConfigured'>> = {
  knowledge: 'synthetic_local_eval',
  agent: 'deterministic_local_eval',
  deploymentConfigured: false,
};

const REASON_ORDER: readonly ReleaseReadinessReasonCode[] = [
  'CONFIG_INVALID',
  'MODE_CONFLICT',
  'BUSINESS_INPUT_NOT_READY',
  'BUSINESS_NOT_PRODUCTION_READY',
  'KNOWLEDGE_SOURCE_NOT_APPROVED',
  'SYNTHETIC_NOT_PRODUCTION',
  'STAFF_IDENTITY_NOT_CONFIGURED',
  'AGENT_PROVIDER_NOT_CONFIGURED',
  'DEPLOYMENT_TARGET_NOT_CONFIGURED',
];

const BUSINESS_REASON_MAP: Readonly<Record<string, ReleaseReadinessReasonCode | undefined>> = {
  SOURCE_NOT_APPROVED: 'KNOWLEDGE_SOURCE_NOT_APPROVED',
  SYNTHETIC_NOT_PRODUCTION: 'SYNTHETIC_NOT_PRODUCTION',
};

function uniqueReasons(reasons: ReleaseReadinessReasonCode[]): ReleaseReadinessReasonCode[] {
  return REASON_ORDER.filter((code) => reasons.includes(code));
}

function expectedAppEnv(target: ReleaseReadinessTarget): AppEnvironment {
  return target;
}

function appendBusinessReasons(report: BusinessReadinessReport | null, reasons: ReleaseReadinessReasonCode[]): void {
  if (!report) return;
  for (const reason of report.reasonCodes) {
    const mapped = BUSINESS_REASON_MAP[reason];
    if (mapped) reasons.push(mapped);
  }
}

/**
 * Combines already-validated runtime, business, and capability facts without trusting readiness flags from input.
 * Capability values are supplied by code-owned adapters; environment variables only select the runtime mode.
 */
export function evaluateReleaseReadiness(input: ReleaseReadinessInput): ReleaseReadinessReport {
  const reasons: ReleaseReadinessReasonCode[] = [];
  if (!input.configValid) reasons.push('CONFIG_INVALID');
  if (input.appEnv !== expectedAppEnv(input.target)) reasons.push('MODE_CONFLICT');

  const expectedBusinessStatus = input.target === 'production' ? 'PRODUCTION_READY' : 'LOCAL_EVAL_READY';
  const businessIsReady = input.businessReadiness?.status === expectedBusinessStatus && input.businessReadiness.reasonCodes.length === 0;
  if (!businessIsReady) {
    reasons.push(input.target === 'production' ? 'BUSINESS_NOT_PRODUCTION_READY' : 'BUSINESS_INPUT_NOT_READY');
    appendBusinessReasons(input.businessReadiness, reasons);
  }

  if (input.target === 'production') {
    if (input.capabilities.knowledge !== 'published') reasons.push('KNOWLEDGE_SOURCE_NOT_APPROVED');
    if (input.capabilities.knowledge === 'synthetic_local_eval') reasons.push('SYNTHETIC_NOT_PRODUCTION');
    if (input.capabilities.staff !== 'identity_provider') reasons.push('STAFF_IDENTITY_NOT_CONFIGURED');
    if (input.capabilities.agent !== 'provider') reasons.push('AGENT_PROVIDER_NOT_CONFIGURED');
    if (!input.capabilities.deploymentConfigured) reasons.push('DEPLOYMENT_TARGET_NOT_CONFIGURED');
  } else {
    if (input.capabilities.knowledge !== 'synthetic_local_eval') reasons.push('KNOWLEDGE_SOURCE_NOT_APPROVED');
    if (input.capabilities.agent !== 'deterministic_local_eval') reasons.push('AGENT_PROVIDER_NOT_CONFIGURED');
    if (!['deny', 'test'].includes(input.capabilities.staff)) reasons.push('STAFF_IDENTITY_NOT_CONFIGURED');
  }

  const reasonCodes = uniqueReasons(reasons);
  if (reasonCodes.length > 0) return { status: 'NOT_READY', target: input.target, reasonCodes };
  const status: ReleaseReadinessStatus = input.target === 'local_eval'
    ? 'LOCAL_EVAL_READY'
    : input.target === 'rehearsal'
      ? 'REHEARSAL_READY'
      : 'PRODUCTION_READY';
  return { status, target: input.target, reasonCodes: [] };
}

export function capabilitiesForRuntime(config: Pick<RuntimeConfig, 'staffAuthMode'>): ReleaseCapabilities {
  const staff: StaffCapability = config.staffAuthMode === 'test' ? 'test' : 'deny';
  return { ...CURRENT_RELEASE_CAPABILITIES, staff };
}

export function targetFromAppEnvironment(appEnv: AppEnvironment): ReleaseReadinessTarget | null {
  return appEnv === 'local_eval' || appEnv === 'rehearsal' || appEnv === 'production' ? appEnv : null;
}

export function staffCapabilityFromMode(mode: StaffAuthMode): StaffCapability {
  return mode === 'test' ? 'test' : 'deny';
}
