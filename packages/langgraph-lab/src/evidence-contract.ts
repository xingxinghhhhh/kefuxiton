import type { ReplayDiagnosticReport } from './replay-diagnostic-contract.js';

export const N22_SCHEMA_VERSION = 'n22.v1' as const;
export const N22_SOURCE_SCHEMA_VERSION = 'n21.v1' as const;
export const N22_EVIDENCE_TYPE = 'n21_replay_diagnostic' as const;
export const N22_DIGEST_ALGORITHM = 'sha256' as const;
export const N22_MAX_ENVELOPE_BYTES = 20 * 1024;

export const N22_REASON_CODES = [
  'NONE',
  'ENVELOPE_INVALID',
  'SOURCE_VERSION_UNSUPPORTED',
  'DIGEST_MISMATCH',
  'SENSITIVE_DATA_REJECTED',
  'SIZE_LIMIT_EXCEEDED',
] as const;
export type N22ReasonCode = (typeof N22_REASON_CODES)[number];

export interface EvidenceEnvelope {
  schemaVersion: typeof N22_SCHEMA_VERSION;
  evidenceType: typeof N22_EVIDENCE_TYPE;
  sourceSchemaVersion: typeof N22_SOURCE_SCHEMA_VERSION;
  digestAlgorithm: typeof N22_DIGEST_ALGORITHM;
  report: ReplayDiagnosticReport;
  evidenceDigest: string;
}
export interface EvidenceVerificationResult {
  schemaVersion: typeof N22_SCHEMA_VERSION;
  status: 'valid' | 'invalid';
  reasonCode: N22ReasonCode;
  digestMatch: boolean;
}

export function isN22ReasonCode(value: unknown): value is N22ReasonCode {
  return typeof value === 'string' && (N22_REASON_CODES as readonly string[]).includes(value);
}
