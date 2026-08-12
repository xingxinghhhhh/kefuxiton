import { verifyEvidenceBundle } from '../src/bundle-seal.js';

describe('N23 evidence bundle isolation', () => {
  it('returns only bounded safe fields for malformed runtime values', () => {
    const result = verifyEvidenceBundle({
      schemaVersion: 'n23.v1',
      bundleType: 'n22_replay_evidence_bundle',
      sourceSchemaVersion: 'n22.v1',
      digestAlgorithm: 'sha256',
      caseCount: 13,
      items: [],
      bundleDigest: '0'.repeat(64),
      runtime: 'synthetic-runtime-secret',
    }, []);

    expect(Object.keys(result)).toEqual(['schemaVersion', 'status', 'reasonCode', 'bundleDigestMatch', 'validatedCaseCount']);
    expect(result.status).toBe('invalid');
    expect(JSON.stringify(result)).not.toContain('synthetic-runtime-secret');
  });
});
