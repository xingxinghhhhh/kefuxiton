import {
  N23_CASE_COUNT,
  N23_DIGEST_ALGORITHM,
  N23_SCHEMA_VERSION,
  N23_SOURCE_SCHEMA_VERSION,
  isN23ReasonCode,
  type N23ReasonCode,
} from './bundle-contract.js';
import { verifyEvidenceBundle } from './bundle-seal.js';

const SHA256_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

export interface EvidenceGateSnapshot {
  status: 'passed' | 'blocked';
  bundleSchemaVersion: typeof N23_SCHEMA_VERSION | null;
  sourceSchemaVersion: typeof N23_SOURCE_SCHEMA_VERSION | null;
  digestAlgorithm: typeof N23_DIGEST_ALGORITHM | null;
  expectedCaseCount: typeof N23_CASE_COUNT;
  validatedCaseCount: number;
  bundleDigest: string | null;
  bundleDigestMatch: boolean;
  reasonCode: N23ReasonCode;
}

/** Projects the existing bundle verifier result into a redacted operator-facing gate snapshot. */
export function buildEvidenceGateSnapshot(bundle: unknown, envelopes: readonly unknown[]): EvidenceGateSnapshot {
  const projected = projectSafeBundleFields(bundle);

  try {
    const verification = verifyEvidenceBundle(bundle, envelopes);
    if (!isRecord(verification) || verification.schemaVersion !== N23_SCHEMA_VERSION) {
      return blocked(projected, 'BUNDLE_INVALID');
    }

    const validatedCaseCount = boundedCaseCount(verification.validatedCaseCount);
    if (validatedCaseCount === null || typeof verification.bundleDigestMatch !== 'boolean' || !isN23ReasonCode(verification.reasonCode)) {
      return blocked(projected, 'BUNDLE_INVALID');
    }

    if (verification.status === 'valid'
      && verification.reasonCode === 'NONE'
      && verification.bundleDigestMatch
      && validatedCaseCount === N23_CASE_COUNT
      && projected.bundleSchemaVersion === N23_SCHEMA_VERSION
      && projected.sourceSchemaVersion === N23_SOURCE_SCHEMA_VERSION
      && projected.digestAlgorithm === N23_DIGEST_ALGORITHM
      && projected.bundleDigest !== null) {
      return {
        status: 'passed',
        bundleSchemaVersion: projected.bundleSchemaVersion,
        sourceSchemaVersion: projected.sourceSchemaVersion,
        digestAlgorithm: projected.digestAlgorithm,
        expectedCaseCount: N23_CASE_COUNT,
        validatedCaseCount,
        bundleDigest: projected.bundleDigest,
        bundleDigestMatch: true,
        reasonCode: 'NONE',
      };
    }

    if (verification.status !== 'invalid') return blocked(projected, 'BUNDLE_INVALID');
    return {
      status: 'blocked',
      bundleSchemaVersion: projected.bundleSchemaVersion,
      sourceSchemaVersion: projected.sourceSchemaVersion,
      digestAlgorithm: projected.digestAlgorithm,
      expectedCaseCount: N23_CASE_COUNT,
      validatedCaseCount,
      bundleDigest: projected.bundleDigest,
      bundleDigestMatch: verification.bundleDigestMatch,
      reasonCode: verification.reasonCode,
    };
  } catch {
    return blocked(projected, 'BUNDLE_INVALID');
  }
}

function projectSafeBundleFields(value: unknown): SafeBundleFields {
  if (!isRecord(value)) return emptyProjection();
  return {
    bundleSchemaVersion: value.schemaVersion === N23_SCHEMA_VERSION ? N23_SCHEMA_VERSION : null,
    sourceSchemaVersion: value.sourceSchemaVersion === N23_SOURCE_SCHEMA_VERSION ? N23_SOURCE_SCHEMA_VERSION : null,
    digestAlgorithm: value.digestAlgorithm === N23_DIGEST_ALGORITHM ? N23_DIGEST_ALGORITHM : null,
    bundleDigest: typeof value.bundleDigest === 'string' && SHA256_DIGEST_PATTERN.test(value.bundleDigest) ? value.bundleDigest : null,
  };
}

function boundedCaseCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= N23_CASE_COUNT ? value : null;
}

function blocked(projected: SafeBundleFields, reasonCode: N23ReasonCode): EvidenceGateSnapshot {
  return {
    status: 'blocked',
    bundleSchemaVersion: projected.bundleSchemaVersion,
    sourceSchemaVersion: projected.sourceSchemaVersion,
    digestAlgorithm: projected.digestAlgorithm,
    expectedCaseCount: N23_CASE_COUNT,
    validatedCaseCount: 0,
    bundleDigest: projected.bundleDigest,
    bundleDigestMatch: false,
    reasonCode,
  };
}

function emptyProjection(): SafeBundleFields {
  return { bundleSchemaVersion: null, sourceSchemaVersion: null, digestAlgorithm: null, bundleDigest: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface SafeBundleFields {
  bundleSchemaVersion: typeof N23_SCHEMA_VERSION | null;
  sourceSchemaVersion: typeof N23_SOURCE_SCHEMA_VERSION | null;
  digestAlgorithm: typeof N23_DIGEST_ALGORITHM | null;
  bundleDigest: string | null;
}
