import { verifyEvidenceEnvelope } from '../src/evidence-seal.js';
import { verifyEvidenceBundle } from '../src/bundle-seal.js';
import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { createN27TamperedInput, N27_TAMPER_SCENARIO_IDS, type N27TamperScenarioId } from './evidence-chain-fixtures.js';

const expectedBundleReasons: Record<N27TamperScenarioId, string> = {
  'tamper-envelope-digest': 'ENVELOPE_TAMPERED',
  'tamper-bundle-item-digest': 'ENVELOPE_TAMPERED',
  'tamper-bundle-digest': 'BUNDLE_DIGEST_MISMATCH',
  'tamper-case-order': 'CASE_ORDER_INVALID',
};

const expectedValidatedCaseCounts: Record<N27TamperScenarioId, number> = {
  'tamper-envelope-digest': 0,
  'tamper-bundle-item-digest': 0,
  'tamper-bundle-digest': 13,
  'tamper-case-order': 0,
};

describe('N27 evidence chain tamper fail-closed behavior', () => {
  it.each(N27_TAMPER_SCENARIO_IDS)('blocks %s without exposing raw evidence', (scenarioId) => {
    const input = createN27TamperedInput(scenarioId);
    const verification = verifyEvidenceBundle(input.bundle, input.envelopes);
    const snapshot = buildEvidenceGateSnapshot(input.bundle, input.envelopes);

    expect(verification.status).toBe('invalid');
    expect(verification.reasonCode).toBe(expectedBundleReasons[scenarioId]);
    expect(snapshot).toMatchObject({
      status: 'blocked',
      reasonCode: expectedBundleReasons[scenarioId],
      bundleDigestMatch: false,
      validatedCaseCount: expectedValidatedCaseCounts[scenarioId],
    });
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
    const serializedSnapshot = JSON.stringify(snapshot);
    expect(serializedSnapshot).not.toContain('caseId');
    expect(serializedSnapshot).not.toContain('report');
    expect(serializedSnapshot).not.toContain('prompt');
  });

  it('maps an envelope digest mismatch through the existing N22 and N23 contracts', () => {
    const input = createN27TamperedInput('tamper-envelope-digest');
    const envelope = input.envelopes[0];
    if (envelope === undefined) throw new Error('N27 fixture is missing the first envelope');
    expect(verifyEvidenceEnvelope(envelope)).toMatchObject({ status: 'invalid', reasonCode: 'DIGEST_MISMATCH', digestMatch: false });
    expect(verifyEvidenceBundle(input.bundle, input.envelopes)).toMatchObject({ status: 'invalid', reasonCode: 'ENVELOPE_TAMPERED' });
  });

  it('keeps the original valid inputs unchanged while creating tampered copies', () => {
    const original = createN27TamperedInput('tamper-bundle-digest');
    const originalBundle = structuredClone(original.bundle);
    const originalEnvelopes = structuredClone(original.envelopes);
    buildEvidenceGateSnapshot(original.bundle, original.envelopes);
    expect(original.bundle).toEqual(originalBundle);
    expect(original.envelopes).toEqual(originalEnvelopes);
  });
});
