import type { N20CaseId } from './replay-contract.js';

export const N23_SCHEMA_VERSION = 'n23.v1' as const;
export const N23_BUNDLE_TYPE = 'n22_replay_evidence_bundle' as const;
export const N23_SOURCE_SCHEMA_VERSION = 'n22.v1' as const;
export const N23_DIGEST_ALGORITHM = 'sha256' as const;
export const N23_CASE_COUNT = 13 as const;
export const N23_MAX_BUNDLE_BYTES = 8 * 1024;

export const N23_REASON_CODES = [
  'NONE',
  'BUNDLE_INVALID',
  'CASE_MISSING',
  'CASE_DUPLICATE',
  'CASE_ORDER_INVALID',
  'CASE_UNKNOWN',
  'CASE_ID_MISMATCH',
  'SOURCE_VERSION_UNSUPPORTED',
  'DIGEST_ALGORITHM_UNSUPPORTED',
  'ENVELOPE_INVALID',
  'ENVELOPE_TAMPERED',
  'BUNDLE_DIGEST_MISMATCH',
  'SIZE_LIMIT_EXCEEDED',
  'SENSITIVE_DATA_REJECTED',
] as const;
export type N23ReasonCode = (typeof N23_REASON_CODES)[number];

export interface EvidenceBundleItem {
  caseId: N20CaseId;
  evidenceDigest: string;
}

export interface EvidenceBundle {
  schemaVersion: typeof N23_SCHEMA_VERSION;
  bundleType: typeof N23_BUNDLE_TYPE;
  sourceSchemaVersion: typeof N23_SOURCE_SCHEMA_VERSION;
  digestAlgorithm: typeof N23_DIGEST_ALGORITHM;
  caseCount: typeof N23_CASE_COUNT;
  items: EvidenceBundleItem[];
  bundleDigest: string;
}

export interface EvidenceBundleSealResult {
  schemaVersion: typeof N23_SCHEMA_VERSION;
  status: 'sealed' | 'rejected';
  reasonCode: N23ReasonCode;
  bundle: EvidenceBundle | null;
}

export interface EvidenceBundleVerificationResult {
  schemaVersion: typeof N23_SCHEMA_VERSION;
  status: 'valid' | 'invalid';
  reasonCode: N23ReasonCode;
  bundleDigestMatch: boolean;
  validatedCaseCount: number;
}

export function isN23ReasonCode(value: unknown): value is N23ReasonCode {
  return typeof value === 'string' && (N23_REASON_CODES as readonly string[]).includes(value);
}
