import { N23_SCHEMA_VERSION } from '../src/bundle-contract.js';
import { sealEvidenceBundle, verifyEvidenceBundle } from '../src/bundle-seal.js';
import { cloneEnvelope, makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N23 evidence bundle tamper and completeness checks', () => {
  it('rejects missing and duplicate cases during sealing', () => {
    const envelopes = makeEvidenceEnvelopes();
    expect(sealEvidenceBundle(envelopes.slice(0, -1))).toMatchObject({ status: 'rejected', reasonCode: 'CASE_MISSING', bundle: null });
    expect(sealEvidenceBundle([...envelopes.slice(0, 12), cloneEnvelope(envelopes[11])])).toMatchObject({ status: 'rejected', reasonCode: 'CASE_DUPLICATE', bundle: null });
  });

  it('rejects missing, duplicate, unknown, and reordered bundle items', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();
    expect(verifyEvidenceBundle({ ...bundle, caseCount: 12, items: bundle.items.slice(0, -1) }, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'CASE_MISSING' });
    expect(verifyEvidenceBundle({ ...bundle, items: [...bundle.items.slice(0, 12), bundle.items[11]] }, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'CASE_DUPLICATE' });
    expect(verifyEvidenceBundle({ ...bundle, items: [{ ...bundle.items[0], caseId: 'unknown-case' }, ...bundle.items.slice(1)] }, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'CASE_UNKNOWN' });
    const reordered = [...bundle.items];
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    expect(verifyEvidenceBundle({ ...bundle, items: reordered }, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'CASE_ORDER_INVALID' });
  });

  it('rejects envelope identity, version, algorithm, and content tampering', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();
    const swapped = [...envelopes];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(verifyEvidenceBundle(bundle, swapped)).toMatchObject({ status: 'invalid', reasonCode: 'CASE_ID_MISMATCH' });

    const wrongSource = { ...envelopes[0], sourceSchemaVersion: 'n20.v1' };
    expect(verifyEvidenceBundle(bundle, [wrongSource, ...envelopes.slice(1)])).toMatchObject({ status: 'invalid', reasonCode: 'SOURCE_VERSION_UNSUPPORTED' });

    const wrongAlgorithm = { ...envelopes[0], digestAlgorithm: 'sha512' };
    expect(verifyEvidenceBundle(bundle, [wrongAlgorithm, ...envelopes.slice(1)])).toMatchObject({ status: 'invalid', reasonCode: 'DIGEST_ALGORITHM_UNSUPPORTED' });

    const contentTampered = cloneEnvelope(envelopes[0]);
    contentTampered.report = { ...contentTampered.report, reasonCode: 'REPLAY_INTERNAL' };
    expect(verifyEvidenceBundle(bundle, [contentTampered, ...envelopes.slice(1)])).toMatchObject({ status: 'invalid', reasonCode: 'ENVELOPE_TAMPERED' });

    const digestTampered = cloneEnvelope(envelopes[0]);
    digestTampered.evidenceDigest = '0'.repeat(64);
    expect(verifyEvidenceBundle(bundle, [digestTampered, ...envelopes.slice(1)])).toMatchObject({ status: 'invalid', reasonCode: 'ENVELOPE_TAMPERED' });
  });

  it('rejects item and bundle digest tampering', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();
    const itemTampered = { ...bundle.items[0], evidenceDigest: '0'.repeat(64) };
    expect(verifyEvidenceBundle({ ...bundle, items: [itemTampered, ...bundle.items.slice(1)] }, envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'ENVELOPE_TAMPERED' });
    expect(verifyEvidenceBundle({ ...bundle, bundleDigest: '0'.repeat(64) }, envelopes)).toEqual({
      schemaVersion: N23_SCHEMA_VERSION,
      status: 'invalid',
      reasonCode: 'BUNDLE_DIGEST_MISMATCH',
      bundleDigestMatch: false,
      validatedCaseCount: 13,
    });
  });
});
