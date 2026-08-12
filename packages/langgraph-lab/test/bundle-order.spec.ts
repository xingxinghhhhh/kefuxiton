import { N20_CASE_IDS } from '../src/replay-contract.js';
import { sealEvidenceBundle, verifyEvidenceBundle } from '../src/bundle-seal.js';
import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N23 evidence bundle ordering', () => {
  it('uses the existing N20 allowlist order without sorting or correction', () => {
    const bundle = makeEvidenceBundle();
    expect(bundle.items.map((item) => item.caseId)).toEqual(N20_CASE_IDS);
    const reorderedEnvelopes = [...makeEvidenceEnvelopes()];
    [reorderedEnvelopes[0], reorderedEnvelopes[1]] = [reorderedEnvelopes[1], reorderedEnvelopes[0]];
    expect(sealEvidenceBundle(reorderedEnvelopes)).toMatchObject({ status: 'rejected', reasonCode: 'CASE_ORDER_INVALID' });
  });

  it('keeps the bundle digest stable across repeated sealing', () => {
    const envelopes = makeEvidenceEnvelopes();
    const first = sealEvidenceBundle(envelopes);
    const second = sealEvidenceBundle(envelopes);
    expect(first).toEqual(second);
    if (first.bundle === null) throw new Error('expected bundle');
    expect(verifyEvidenceBundle(first.bundle, envelopes).status).toBe('valid');
  });
});
