import { N20_CASE_IDS } from '../src/replay-contract.js';
import { N23_SCHEMA_VERSION } from '../src/bundle-contract.js';
import { sealEvidenceBundle, verifyEvidenceBundle } from '../src/bundle-seal.js';
import { makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N23 evidence bundle sealing', () => {
  it('seals exactly 13 allowlisted cases as digest-only items', () => {
    const envelopes = makeEvidenceEnvelopes();
    const result = sealEvidenceBundle(envelopes);

    expect(result).toMatchObject({ schemaVersion: N23_SCHEMA_VERSION, status: 'sealed', reasonCode: 'NONE' });
    if (result.bundle === null) throw new Error('expected sealed bundle');
    expect(Object.keys(result.bundle)).toEqual(['schemaVersion', 'bundleType', 'sourceSchemaVersion', 'digestAlgorithm', 'caseCount', 'items', 'bundleDigest']);
    expect(result.bundle.caseCount).toBe(13);
    expect(result.bundle.items.map((item) => item.caseId)).toEqual(N20_CASE_IDS);
    expect(result.bundle.items.every((item) => Object.keys(item).join(',') === 'caseId,evidenceDigest')).toBe(true);
    expect(JSON.stringify(result.bundle)).not.toContain('report');
    expect(JSON.stringify(result.bundle)).not.toContain('actualSummary');
    expect(result.bundle.bundleDigest).toMatch(/^[0-9a-f]{64}$/u);

    expect(verifyEvidenceBundle(result.bundle, envelopes)).toEqual({
      schemaVersion: N23_SCHEMA_VERSION,
      status: 'valid',
      reasonCode: 'NONE',
      bundleDigestMatch: true,
      validatedCaseCount: 13,
    });
  });

  it('produces deterministic bundles for the same envelopes', () => {
    const first = sealEvidenceBundle(makeEvidenceEnvelopes());
    const second = sealEvidenceBundle(makeEvidenceEnvelopes());
    expect(first).toEqual(second);
  });
});
