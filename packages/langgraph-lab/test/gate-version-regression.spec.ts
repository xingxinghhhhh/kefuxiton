import { N23_REASON_CODES, N23_SCHEMA_VERSION } from '../src/bundle-contract.js';
import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { createN26ReplayInput } from './gate-replay-inputs.js';

describe('N26 N20-N25 version and implementation regression', () => {
  it.each([
    ['unknown bundle schema', 'unknown_case'],
    ['future bundle schema', 'unknown_case'],
  ] as const)('blocks %s', (_name, scenarioId) => {
    const input = createN26ReplayInput(scenarioId);
    const bundle = { ...(input.bundle as Record<string, unknown>), schemaVersion: 'n99.v1' };
    expect(buildEvidenceGateSnapshot(bundle, input.envelopes)).toMatchObject({ status: 'blocked', reasonCode: 'BUNDLE_INVALID' });
  });

  it('preserves the current bundle source and algorithm reason mappings', () => {
    const sourceInput = createN26ReplayInput('bundle_source_invalid');
    const algorithmInput = createN26ReplayInput('bundle_algorithm_invalid');
    const envelopeSourceInput = createN26ReplayInput('envelope_source_invalid');
    const envelopeAlgorithmInput = createN26ReplayInput('envelope_algorithm_invalid');

    expect(buildEvidenceGateSnapshot(sourceInput.bundle, sourceInput.envelopes)).toMatchObject({ status: 'blocked', reasonCode: 'SOURCE_VERSION_UNSUPPORTED' });
    expect(buildEvidenceGateSnapshot(algorithmInput.bundle, algorithmInput.envelopes)).toMatchObject({ status: 'blocked', reasonCode: 'DIGEST_ALGORITHM_UNSUPPORTED' });
    expect(buildEvidenceGateSnapshot(envelopeSourceInput.bundle, envelopeSourceInput.envelopes)).toMatchObject({ status: 'blocked', reasonCode: 'SOURCE_VERSION_UNSUPPORTED' });
    expect(buildEvidenceGateSnapshot(envelopeAlgorithmInput.bundle, envelopeAlgorithmInput.envelopes)).toMatchObject({ status: 'blocked', reasonCode: 'DIGEST_ALGORITHM_UNSUPPORTED' });
  });

  it('keeps the N23 reason-code allowlist and N25 exact-key contract frozen', () => {
    expect(N23_REASON_CODES).toEqual([
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
    ]);
    const snapshot = buildEvidenceGateSnapshot(null, []);
    expect(Object.keys(snapshot)).toEqual([
      'status',
      'bundleSchemaVersion',
      'sourceSchemaVersion',
      'digestAlgorithm',
      'expectedCaseCount',
      'validatedCaseCount',
      'bundleDigest',
      'bundleDigestMatch',
      'reasonCode',
    ]);
    expect(snapshot.bundleSchemaVersion).toBeNull();
    expect(snapshot.reasonCode).toBe('BUNDLE_INVALID');
    expect(N23_SCHEMA_VERSION).toBe('n23.v1');
  });
});
