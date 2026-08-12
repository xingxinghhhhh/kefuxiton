import { N23_SCHEMA_VERSION } from '../src/bundle-contract.js';
import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { N26_SCENARIO_IDS, createN26ReplayInput } from './gate-replay-inputs.js';

const SNAPSHOT_KEYS = [
  'status',
  'bundleSchemaVersion',
  'sourceSchemaVersion',
  'digestAlgorithm',
  'expectedCaseCount',
  'validatedCaseCount',
  'bundleDigest',
  'bundleDigestMatch',
  'reasonCode',
] as const;

function canonicalSnapshot(value: ReturnType<typeof buildEvidenceGateSnapshot>): string {
  return JSON.stringify({
    status: value.status,
    bundleSchemaVersion: value.bundleSchemaVersion,
    sourceSchemaVersion: value.sourceSchemaVersion,
    digestAlgorithm: value.digestAlgorithm,
    expectedCaseCount: value.expectedCaseCount,
    validatedCaseCount: value.validatedCaseCount,
    bundleDigest: value.bundleDigest,
    bundleDigestMatch: value.bundleDigestMatch,
    reasonCode: value.reasonCode,
  });
}

describe('N26 deterministic gate snapshot replay', () => {
  it.each(N26_SCENARIO_IDS)('replays %s deterministically from fresh memory inputs', (scenarioId) => {
    const firstInput = createN26ReplayInput(scenarioId);
    const secondInput = createN26ReplayInput(scenarioId);
    const first = buildEvidenceGateSnapshot(firstInput.bundle, firstInput.envelopes);
    const second = buildEvidenceGateSnapshot(secondInput.bundle, secondInput.envelopes);

    expect(first.status).toBe(firstInput.expectedStatus);
    expect(second.status).toBe(secondInput.expectedStatus);
    expect(second).toEqual(first);
    expect(canonicalSnapshot(second)).toBe(canonicalSnapshot(first));
    expect(Object.keys(first)).toEqual(SNAPSHOT_KEYS);
    expect(JSON.stringify(first)).not.toContain('caseId');
    expect(JSON.stringify(first)).not.toContain('prompt');
  });

  it('accepts only the complete current N25 result', () => {
    const input = createN26ReplayInput('valid');
    const snapshot = buildEvidenceGateSnapshot(input.bundle, input.envelopes);

    expect(snapshot).toMatchObject({
      status: 'passed',
      bundleSchemaVersion: N23_SCHEMA_VERSION,
      sourceSchemaVersion: 'n22.v1',
      digestAlgorithm: 'sha256',
      expectedCaseCount: 13,
      validatedCaseCount: 13,
      bundleDigestMatch: true,
      reasonCode: 'NONE',
    });
  });
});
