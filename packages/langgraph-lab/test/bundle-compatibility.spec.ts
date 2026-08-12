import { verifyEvidenceBundle } from '../src/bundle-seal.js';
import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N24 bundle version compatibility', () => {
  it('accepts the current N23 bundle and rejects an unknown bundle schema', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();

    expect(verifyEvidenceBundle(bundle, envelopes)).toMatchObject({ status: 'valid', reasonCode: 'NONE' });
    expect(verifyEvidenceBundle({ ...bundle, schemaVersion: 'n24.v1' }, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'BUNDLE_INVALID' });
  });

  it('keeps bundle source and algorithm failures distinct', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();

    expect(verifyEvidenceBundle({ ...bundle, sourceSchemaVersion: 'n21.v1' }, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'SOURCE_VERSION_UNSUPPORTED' });
    expect(verifyEvidenceBundle({ ...bundle, digestAlgorithm: 'sha512' }, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'DIGEST_ALGORITHM_UNSUPPORTED' });
  });

  it('keeps envelope source, algorithm, and structure failures distinct', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();
    const wrongSource = { ...envelopes[0], sourceSchemaVersion: 'n20.v1' };
    const wrongAlgorithm = { ...envelopes[0], digestAlgorithm: 'sha512' };
    const unknownSchema = { ...envelopes[0], schemaVersion: 'n9.v1' };

    expect(verifyEvidenceBundle(bundle, [wrongSource, ...envelopes.slice(1)])).toMatchObject({ status: 'invalid', reasonCode: 'SOURCE_VERSION_UNSUPPORTED' });
    expect(verifyEvidenceBundle(bundle, [wrongAlgorithm, ...envelopes.slice(1)])).toMatchObject({ status: 'invalid', reasonCode: 'DIGEST_ALGORITHM_UNSUPPORTED' });
    expect(verifyEvidenceBundle(bundle, [unknownSchema, ...envelopes.slice(1)])).toMatchObject({ status: 'invalid', reasonCode: 'ENVELOPE_INVALID' });
  });
});
