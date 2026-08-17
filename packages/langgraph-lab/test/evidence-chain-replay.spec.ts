import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';
import { createN26ReplayInput } from './gate-replay-inputs.js';

function canonicalSnapshot(snapshot: ReturnType<typeof buildEvidenceGateSnapshot>): string {
  return JSON.stringify({
    status: snapshot.status,
    bundleSchemaVersion: snapshot.bundleSchemaVersion,
    sourceSchemaVersion: snapshot.sourceSchemaVersion,
    digestAlgorithm: snapshot.digestAlgorithm,
    expectedCaseCount: snapshot.expectedCaseCount,
    validatedCaseCount: snapshot.validatedCaseCount,
    bundleDigest: snapshot.bundleDigest,
    bundleDigestMatch: snapshot.bundleDigestMatch,
    reasonCode: snapshot.reasonCode,
  });
}

describe('N27 N26 replay and direct snapshot consistency', () => {
  it('matches two fresh N26 replays with a directly constructed N25 snapshot', () => {
    const firstInput = createN26ReplayInput('valid');
    const secondInput = createN26ReplayInput('valid');
    const directEnvelopes = makeEvidenceEnvelopes();
    const directBundle = makeEvidenceBundle(directEnvelopes);

    const firstReplay = buildEvidenceGateSnapshot(firstInput.bundle, firstInput.envelopes);
    const secondReplay = buildEvidenceGateSnapshot(secondInput.bundle, secondInput.envelopes);
    const directSnapshot = buildEvidenceGateSnapshot(directBundle, directEnvelopes);

    expect(firstReplay.status).toBe('passed');
    expect(secondReplay).toEqual(firstReplay);
    expect(directSnapshot).toEqual(firstReplay);
    expect(canonicalSnapshot(firstReplay)).toBe(canonicalSnapshot(secondReplay));
    expect(canonicalSnapshot(firstReplay)).toBe(canonicalSnapshot(directSnapshot));

    const safeEvaluation = {
      scenarioId: 'complete-valid',
      chainStatus: 'valid',
      reasonCode: directSnapshot.reasonCode,
      snapshotStatus: directSnapshot.status,
      replayMatches: secondReplay.status === directSnapshot.status,
    };
    expect(Object.keys(safeEvaluation)).toEqual(['scenarioId', 'chainStatus', 'reasonCode', 'snapshotStatus', 'replayMatches']);
    expect(JSON.stringify(safeEvaluation)).not.toContain('caseId');
    expect(JSON.stringify(safeEvaluation)).not.toContain('report');
  });

  it('does not mutate any of the fresh replay or direct inputs', () => {
    const replayInput = createN26ReplayInput('valid');
    const directEnvelopes = makeEvidenceEnvelopes();
    const directBundle = makeEvidenceBundle(directEnvelopes);
    const replayBundleBefore = structuredClone(replayInput.bundle);
    const replayEnvelopesBefore = structuredClone(replayInput.envelopes);
    const directBundleBefore = structuredClone(directBundle);
    const directEnvelopesBefore = structuredClone(directEnvelopes);

    buildEvidenceGateSnapshot(replayInput.bundle, replayInput.envelopes);
    buildEvidenceGateSnapshot(directBundle, directEnvelopes);

    expect(replayInput.bundle).toEqual(replayBundleBefore);
    expect(replayInput.envelopes).toEqual(replayEnvelopesBefore);
    expect(directBundle).toEqual(directBundleBefore);
    expect(directEnvelopes).toEqual(directEnvelopesBefore);
  });
});
