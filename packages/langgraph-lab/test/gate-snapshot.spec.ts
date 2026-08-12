import { N23_SCHEMA_VERSION } from '../src/bundle-contract.js';
import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';

describe('N25 evidence gate snapshot', () => {
  it('returns one safe passed snapshot for a valid 13-case bundle', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();

    expect(buildEvidenceGateSnapshot(bundle, envelopes)).toEqual({
      status: 'passed',
      bundleSchemaVersion: 'n23.v1',
      sourceSchemaVersion: 'n22.v1',
      digestAlgorithm: 'sha256',
      expectedCaseCount: 13,
      validatedCaseCount: 13,
      bundleDigest: bundle.bundleDigest,
      bundleDigestMatch: true,
      reasonCode: 'NONE',
    });
  });

  it('keeps the snapshot exact-key and does not expose case details', () => {
    const snapshot = buildEvidenceGateSnapshot(makeEvidenceBundle(), makeEvidenceEnvelopes());
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
    expect(JSON.stringify(snapshot)).not.toContain('caseId');
    expect(JSON.stringify(snapshot)).not.toContain('report');
    expect(JSON.stringify(snapshot)).not.toContain('actualSummary');
    expect(snapshot.bundleSchemaVersion).toBe(N23_SCHEMA_VERSION);
  });
});
