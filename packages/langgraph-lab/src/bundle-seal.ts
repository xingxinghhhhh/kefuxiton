import { createHash } from 'node:crypto';
import {
  N20_CASE_IDS,
  isN20CaseId,
  type N20CaseId,
} from './replay-contract.js';
import {
  N22_DIGEST_ALGORITHM,
  N22_SOURCE_SCHEMA_VERSION,
  type EvidenceVerificationResult,
} from './evidence-contract.js';
import { verifyEvidenceEnvelope } from './evidence-seal.js';
import {
  N23_BUNDLE_TYPE,
  N23_CASE_COUNT,
  N23_DIGEST_ALGORITHM,
  N23_MAX_BUNDLE_BYTES,
  N23_SCHEMA_VERSION,
  N23_SOURCE_SCHEMA_VERSION,
  type EvidenceBundle,
  type EvidenceBundleItem,
  type EvidenceBundleSealResult,
  type EvidenceBundleVerificationResult,
  type N23ReasonCode,
} from './bundle-contract.js';

const BUNDLE_KEYS = ['schemaVersion', 'bundleType', 'sourceSchemaVersion', 'digestAlgorithm', 'caseCount', 'items', 'bundleDigest'] as const;
const ITEM_KEYS = ['caseId', 'evidenceDigest'] as const;

export function sealEvidenceBundle(envelopes: readonly unknown[]): EvidenceBundleSealResult {
  const inputCount = Array.isArray(envelopes) ? envelopes.length : 0;
  if (!Array.isArray(envelopes) || envelopes.length !== N23_CASE_COUNT) {
    return rejected(inputCount < N23_CASE_COUNT ? 'CASE_MISSING' : 'BUNDLE_INVALID');
  }

  const items: EvidenceBundleItem[] = [];
  const seen = new Set<N20CaseId>();
  for (let index = 0; index < envelopes.length; index += 1) {
    const envelope = envelopes[index];
    const metadata = readEnvelopeFields(envelope);
    if (metadata !== null) {
      if (metadata.sourceSchemaVersion !== N22_SOURCE_SCHEMA_VERSION) return rejected('SOURCE_VERSION_UNSUPPORTED');
      if (metadata.digestAlgorithm !== N22_DIGEST_ALGORITHM) return rejected('DIGEST_ALGORITHM_UNSUPPORTED');
      if (metadata.caseId !== null && !isN20CaseId(metadata.caseId)) return rejected('CASE_UNKNOWN');
    }
    const envelopeResult = verifyEvidenceEnvelope(envelope);
    const mapped = mapEnvelopeVerification(envelopeResult);
    if (mapped !== null) return rejected(mapped);

    const fields = metadata;
    if (fields === null) return rejected('ENVELOPE_INVALID');
    if (fields.sourceSchemaVersion !== N22_SOURCE_SCHEMA_VERSION) return rejected('SOURCE_VERSION_UNSUPPORTED');
    if (fields.digestAlgorithm !== N22_DIGEST_ALGORITHM) return rejected('DIGEST_ALGORITHM_UNSUPPORTED');
    if (fields.caseId === null) return rejected('CASE_MISSING');
    if (!isN20CaseId(fields.caseId)) return rejected('CASE_UNKNOWN');
    if (seen.has(fields.caseId)) return rejected('CASE_DUPLICATE');
    if (fields.caseId !== N20_CASE_IDS[index]) return rejected('CASE_ORDER_INVALID');

    seen.add(fields.caseId);
    items.push({ caseId: fields.caseId, evidenceDigest: fields.evidenceDigest });
  }

  if (seen.size !== N23_CASE_COUNT) return rejected('CASE_MISSING');
  const unsigned = createUnsignedBundle(items);
  const canonical = canonicalJson(unsigned);
  if (byteLength(canonical) > N23_MAX_BUNDLE_BYTES) return rejected('SIZE_LIMIT_EXCEEDED');

  return {
    schemaVersion: N23_SCHEMA_VERSION,
    status: 'sealed',
    reasonCode: 'NONE',
    bundle: { ...unsigned, bundleDigest: sha256(canonical) },
  };
}

export function verifyEvidenceBundle(bundle: unknown, envelopes: readonly unknown[]): EvidenceBundleVerificationResult {
  const structure = validateBundleShape(bundle);
  if (structure.reasonCode !== null) return invalid(structure.reasonCode, false, 0);
  const inputCount = Array.isArray(envelopes) ? envelopes.length : 0;
  if (!Array.isArray(envelopes) || envelopes.length !== N23_CASE_COUNT) {
    return invalid(inputCount < N23_CASE_COUNT ? 'CASE_MISSING' : 'BUNDLE_INVALID', false, 0);
  }

  const candidate = structure.bundle;
  const seen = new Set<N20CaseId>();
  for (let index = 0; index < N23_CASE_COUNT; index += 1) {
    const item = candidate.items[index];
    if (!isN20CaseId(item.caseId)) return invalid('CASE_UNKNOWN', false, index);
    if (seen.has(item.caseId)) return invalid('CASE_DUPLICATE', false, index);
    if (item.caseId !== N20_CASE_IDS[index]) return invalid('CASE_ORDER_INVALID', false, index);
    seen.add(item.caseId);
    if (!/^[0-9a-f]{64}$/u.test(item.evidenceDigest)) return invalid('BUNDLE_INVALID', false, index);

    const envelope = envelopes[index];
    const metadata = readEnvelopeFields(envelope);
    if (metadata !== null) {
      if (metadata.sourceSchemaVersion !== N22_SOURCE_SCHEMA_VERSION) return invalid('SOURCE_VERSION_UNSUPPORTED', false, index);
      if (metadata.digestAlgorithm !== N22_DIGEST_ALGORITHM) return invalid('DIGEST_ALGORITHM_UNSUPPORTED', false, index);
      if (metadata.caseId !== null && !isN20CaseId(metadata.caseId)) return invalid('CASE_UNKNOWN', false, index);
    }
    const envelopeResult = verifyEvidenceEnvelope(envelope);
    const mapped = mapEnvelopeVerification(envelopeResult);
    if (mapped !== null) return invalid(mapped, false, index);

    const fields = metadata;
    if (fields === null) return invalid('ENVELOPE_INVALID', false, index);
    if (fields.sourceSchemaVersion !== N22_SOURCE_SCHEMA_VERSION) return invalid('SOURCE_VERSION_UNSUPPORTED', false, index);
    if (fields.digestAlgorithm !== N22_DIGEST_ALGORITHM) return invalid('DIGEST_ALGORITHM_UNSUPPORTED', false, index);
    if (fields.caseId !== item.caseId) return invalid('CASE_ID_MISMATCH', false, index);
    if (fields.evidenceDigest !== item.evidenceDigest) return invalid('ENVELOPE_TAMPERED', false, index);
  }

  const expectedDigest = sha256(canonicalJson(createUnsignedBundle(candidate.items)));
  if (expectedDigest !== candidate.bundleDigest) return invalid('BUNDLE_DIGEST_MISMATCH', false, N23_CASE_COUNT);
  return {
    schemaVersion: N23_SCHEMA_VERSION,
    status: 'valid',
    reasonCode: 'NONE',
    bundleDigestMatch: true,
    validatedCaseCount: N23_CASE_COUNT,
  };
}

function validateBundleShape(value: unknown): { bundle: EvidenceBundle; reasonCode: N23ReasonCode | null } {
  if (!isRecord(value)) return { bundle: emptyBundle(), reasonCode: 'BUNDLE_INVALID' };
  if (!hasExactKeys(value, BUNDLE_KEYS)) {
    return { bundle: emptyBundle(), reasonCode: hasSensitiveOwnKey(value) ? 'SENSITIVE_DATA_REJECTED' : 'BUNDLE_INVALID' };
  }
  if (serializedByteLength(value) > N23_MAX_BUNDLE_BYTES) return { bundle: emptyBundle(), reasonCode: 'SIZE_LIMIT_EXCEEDED' };
  if (value.schemaVersion !== N23_SCHEMA_VERSION || value.bundleType !== N23_BUNDLE_TYPE) return { bundle: emptyBundle(), reasonCode: 'BUNDLE_INVALID' };
  if (value.sourceSchemaVersion !== N23_SOURCE_SCHEMA_VERSION) return { bundle: emptyBundle(), reasonCode: 'SOURCE_VERSION_UNSUPPORTED' };
  if (value.digestAlgorithm !== N23_DIGEST_ALGORITHM) return { bundle: emptyBundle(), reasonCode: 'DIGEST_ALGORITHM_UNSUPPORTED' };
  if (!Array.isArray(value.items)) return { bundle: emptyBundle(), reasonCode: 'BUNDLE_INVALID' };
  if (typeof value.caseCount !== 'number') return { bundle: emptyBundle(), reasonCode: 'BUNDLE_INVALID' };
  if (value.items.length < N23_CASE_COUNT || value.caseCount < N23_CASE_COUNT) return { bundle: emptyBundle(), reasonCode: 'CASE_MISSING' };
  if (value.items.length !== N23_CASE_COUNT || value.caseCount !== N23_CASE_COUNT) return { bundle: emptyBundle(), reasonCode: 'BUNDLE_INVALID' };
  if (typeof value.bundleDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(value.bundleDigest)) return { bundle: emptyBundle(), reasonCode: 'BUNDLE_INVALID' };

  const items: EvidenceBundleItem[] = [];
  for (const item of value.items) {
    if (!isRecord(item)) return { bundle: emptyBundle(), reasonCode: 'BUNDLE_INVALID' };
    if (!hasExactKeys(item, ITEM_KEYS)) {
      return { bundle: emptyBundle(), reasonCode: hasSensitiveOwnKey(item) ? 'SENSITIVE_DATA_REJECTED' : 'BUNDLE_INVALID' };
    }
    if (!isN20CaseId(item.caseId)) return { bundle: emptyBundle(), reasonCode: 'CASE_UNKNOWN' };
    if (typeof item.evidenceDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(item.evidenceDigest)) return { bundle: emptyBundle(), reasonCode: 'BUNDLE_INVALID' };
    items.push({ caseId: item.caseId, evidenceDigest: item.evidenceDigest });
  }

  return {
    bundle: {
      schemaVersion: N23_SCHEMA_VERSION,
      bundleType: N23_BUNDLE_TYPE,
      sourceSchemaVersion: N23_SOURCE_SCHEMA_VERSION,
      digestAlgorithm: N23_DIGEST_ALGORITHM,
      caseCount: N23_CASE_COUNT,
      items,
      bundleDigest: value.bundleDigest,
    },
    reasonCode: null,
  };
}

function createUnsignedBundle(items: EvidenceBundleItem[]): Omit<EvidenceBundle, 'bundleDigest'> {
  return {
    schemaVersion: N23_SCHEMA_VERSION,
    bundleType: N23_BUNDLE_TYPE,
    sourceSchemaVersion: N23_SOURCE_SCHEMA_VERSION,
    digestAlgorithm: N23_DIGEST_ALGORITHM,
    caseCount: N23_CASE_COUNT,
    items: items.map((item) => ({ caseId: item.caseId, evidenceDigest: item.evidenceDigest })),
  };
}

function readEnvelopeFields(value: unknown): { caseId: unknown; sourceSchemaVersion: unknown; digestAlgorithm: unknown; evidenceDigest: string } | null {
  if (!isRecord(value) || !isRecord(value.report) || typeof value.evidenceDigest !== 'string') return null;
  return {
    caseId: value.report.caseId,
    sourceSchemaVersion: value.sourceSchemaVersion,
    digestAlgorithm: value.digestAlgorithm,
    evidenceDigest: value.evidenceDigest,
  };
}

function mapEnvelopeVerification(result: EvidenceVerificationResult): N23ReasonCode | null {
  if (result.status === 'valid') return null;
  if (result.reasonCode === 'SOURCE_VERSION_UNSUPPORTED') return 'SOURCE_VERSION_UNSUPPORTED';
  if (result.reasonCode === 'SENSITIVE_DATA_REJECTED') return 'SENSITIVE_DATA_REJECTED';
  if (result.reasonCode === 'SIZE_LIMIT_EXCEEDED') return 'SIZE_LIMIT_EXCEEDED';
  if (result.reasonCode === 'DIGEST_MISMATCH') return 'ENVELOPE_TAMPERED';
  return 'ENVELOPE_INVALID';
}

function invalid(reasonCode: N23ReasonCode, bundleDigestMatch: boolean, validatedCaseCount: number): EvidenceBundleVerificationResult {
  return {
    schemaVersion: N23_SCHEMA_VERSION,
    status: 'invalid',
    reasonCode,
    bundleDigestMatch,
    validatedCaseCount: Math.max(0, Math.min(N23_CASE_COUNT, validatedCaseCount)),
  };
}

function rejected(reasonCode: N23ReasonCode): EvidenceBundleSealResult {
  return { schemaVersion: N23_SCHEMA_VERSION, status: 'rejected', reasonCode, bundle: null };
}

function emptyBundle(): EvidenceBundle {
  return {
    schemaVersion: N23_SCHEMA_VERSION,
    bundleType: N23_BUNDLE_TYPE,
    sourceSchemaVersion: N23_SOURCE_SCHEMA_VERSION,
    digestAlgorithm: N23_DIGEST_ALGORITHM,
    caseCount: N23_CASE_COUNT,
    items: [],
    bundleDigest: '',
  };
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasSensitiveOwnKey(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => /input|payload|token|secret|password|credential|checkpoint|trace.?id|thread.?id|path|stack|prompt|operator|environment|database|connection|runtime/i.test(key));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function serializedByteLength(value: unknown): number {
  try {
    return byteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
