import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N25 gate snapshot determinism', () => {
  it('returns byte-equivalent JSON for repeated calls', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();
    const first = buildEvidenceGateSnapshot(bundle, envelopes);
    const second = buildEvidenceGateSnapshot(bundle, envelopes);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
