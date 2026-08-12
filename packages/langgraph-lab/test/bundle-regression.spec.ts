import { N20_CASE_IDS } from '../src/replay-contract.js';
import { N23_REASON_CODES, N23_SCHEMA_VERSION } from '../src/bundle-contract.js';
import { sealEvidenceBundle, verifyEvidenceBundle } from '../src/bundle-seal.js';
import { makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N24 N23 regression contract', () => {
  it('preserves the N23 public bundle and verification shapes', () => {
    const envelopes = makeEvidenceEnvelopes();
    const sealed = sealEvidenceBundle(envelopes);
    if (sealed.bundle === null) throw new Error('expected bundle');

    expect(Object.keys(sealed.bundle)).toEqual(['schemaVersion', 'bundleType', 'sourceSchemaVersion', 'digestAlgorithm', 'caseCount', 'items', 'bundleDigest']);
    expect(sealed.bundle.schemaVersion).toBe(N23_SCHEMA_VERSION);
    expect(sealed.bundle.items.map((item) => item.caseId)).toEqual(N20_CASE_IDS);
    expect(verifyEvidenceBundle(sealed.bundle, envelopes)).toEqual({
      schemaVersion: N23_SCHEMA_VERSION,
      status: 'valid',
      reasonCode: 'NONE',
      bundleDigestMatch: true,
      validatedCaseCount: 13,
    });
  });

  it('keeps the fixed reason-code set and fail-closed tamper behavior', () => {
    const envelopes = makeEvidenceEnvelopes();
    const sealed = sealEvidenceBundle(envelopes);
    if (sealed.bundle === null) throw new Error('expected bundle');
    const itemTampered = { ...sealed.bundle.items[0], evidenceDigest: '0'.repeat(64) };
    const bundleTampered = { ...sealed.bundle, bundleDigest: '0'.repeat(64) };

    expect(N23_REASON_CODES).toHaveLength(14);
    expect(verifyEvidenceBundle({ ...sealed.bundle, items: [itemTampered, ...sealed.bundle.items.slice(1)] }, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'ENVELOPE_TAMPERED' });
    expect(verifyEvidenceBundle(bundleTampered, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'BUNDLE_DIGEST_MISMATCH' });
  });
});
