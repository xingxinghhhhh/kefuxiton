import { verifyEvidenceEnvelope } from '../src/evidence-seal.js';

describe('N22 evidence isolation', () => {
  it('returns a bounded failure result without exposing runtime context', () => {
    const result = verifyEvidenceEnvelope({
      schemaVersion: 'n22.v1',
      evidenceType: 'n21_replay_diagnostic',
      sourceSchemaVersion: 'n21.v1',
      digestAlgorithm: 'sha256',
      report: null,
      evidenceDigest: '0'.repeat(64),
      traceId: 'synthetic-secret',
    });

    expect(result.status).toBe('invalid');
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
  });
});
