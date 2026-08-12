import { sealEvidenceBundle, verifyEvidenceBundle } from '../src/bundle-seal.js';
import { cloneEnvelope, makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N24 bundle mutation isolation', () => {
  it('does not retain mutable envelope or array references after sealing', () => {
    const envelopes = makeEvidenceEnvelopes();
    const sealed = sealEvidenceBundle(envelopes);
    if (sealed.bundle === null) throw new Error('expected bundle');
    const before = structuredClone(sealed.bundle);

    envelopes[0].report = { ...envelopes[0].report, reasonCode: 'REPLAY_INTERNAL' };
    envelopes[0] = cloneEnvelope(envelopes[1]);

    expect(sealed.bundle).toEqual(before);
  });

  it('does not mutate caller-owned bundle or envelopes while verifying', () => {
    const envelopes = makeEvidenceEnvelopes();
    const sealed = sealEvidenceBundle(envelopes);
    if (sealed.bundle === null) throw new Error('expected bundle');
    const bundleBefore = structuredClone(sealed.bundle);
    const envelopesBefore = structuredClone(envelopes);

    expect(verifyEvidenceBundle(sealed.bundle, envelopes)).toMatchObject({ status: 'valid', reasonCode: 'NONE' });
    expect(sealed.bundle).toEqual(bundleBefore);
    expect(envelopes).toEqual(envelopesBefore);
  });
});
