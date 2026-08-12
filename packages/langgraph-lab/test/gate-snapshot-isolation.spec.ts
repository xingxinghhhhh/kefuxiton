import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N25 gate snapshot input isolation', () => {
  it('does not mutate the bundle or envelopes', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();
    const bundleBefore = structuredClone(bundle);
    const envelopesBefore = structuredClone(envelopes);

    buildEvidenceGateSnapshot(bundle, envelopes);

    expect(bundle).toEqual(bundleBefore);
    expect(envelopes).toEqual(envelopesBefore);
  });
});
