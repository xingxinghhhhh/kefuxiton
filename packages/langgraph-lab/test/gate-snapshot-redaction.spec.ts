import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N25 gate snapshot failure mapping and redaction', () => {
  it.each([
    ['missing case', (bundle: ReturnType<typeof makeEvidenceBundle>, envelopes: ReturnType<typeof makeEvidenceEnvelopes>) => ({ bundle, envelopes: envelopes.slice(0, -1) })],
    ['unknown bundle schema', (bundle: ReturnType<typeof makeEvidenceBundle>, envelopes: ReturnType<typeof makeEvidenceEnvelopes>) => ({ bundle: { ...bundle, schemaVersion: 'n99.v1' }, envelopes })],
    ['bundle digest tamper', (bundle: ReturnType<typeof makeEvidenceBundle>, envelopes: ReturnType<typeof makeEvidenceEnvelopes>) => ({ bundle: { ...bundle, bundleDigest: '0'.repeat(64) }, envelopes })],
    ['envelope digest tamper', (bundle: ReturnType<typeof makeEvidenceBundle>, envelopes: ReturnType<typeof makeEvidenceEnvelopes>) => ({ bundle, envelopes: [{ ...envelopes[0], evidenceDigest: '0'.repeat(64) }, ...envelopes.slice(1)] })],
  ])('blocks %s without exposing input data', (_name, mutate) => {
    const sourceBundle = makeEvidenceBundle();
    const sourceEnvelopes = makeEvidenceEnvelopes();
    const { bundle, envelopes } = mutate(sourceBundle, sourceEnvelopes);

    const snapshot = buildEvidenceGateSnapshot(bundle, envelopes);
    expect(snapshot.status).toBe('blocked');
    expect(snapshot.reasonCode).not.toBe('NONE');
    expect(Object.keys(snapshot)).toHaveLength(9);
    expect(JSON.stringify(snapshot)).not.toContain('report');
    expect(JSON.stringify(snapshot)).not.toContain('passed-');
    expect(JSON.stringify(snapshot)).not.toContain('caseId');
  });

  it('maps malformed and non-array inputs to a safe fail-closed snapshot', () => {
    expect(buildEvidenceGateSnapshot(null, [] as readonly unknown[])).toEqual({
      status: 'blocked',
      bundleSchemaVersion: null,
      sourceSchemaVersion: null,
      digestAlgorithm: null,
      expectedCaseCount: 13,
      validatedCaseCount: 0,
      bundleDigest: null,
      bundleDigestMatch: false,
      reasonCode: 'BUNDLE_INVALID',
    });
    expect(buildEvidenceGateSnapshot({}, 'not-an-array' as unknown as readonly unknown[]).reasonCode).toBe('BUNDLE_INVALID');
  });
});
