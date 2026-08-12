import { N22_SCHEMA_VERSION } from '../src/evidence-contract.js';
import { EvidenceSealError, sealReplayDiagnosticReport, verifyEvidenceEnvelope } from '../src/evidence-seal.js';
import { makeDiagnosticReport } from './evidence-fixtures.js';

describe('N22 evidence redaction', () => {
  it('rejects a report with an injected raw input field without echoing it', () => {
    const report = { ...makeDiagnosticReport('passed-n17-normal'), rawInput: 'customer secret' };

    expect(() => sealReplayDiagnosticReport(report)).toThrow(EvidenceSealError);
    try {
      sealReplayDiagnosticReport(report);
    } catch (error) {
      expect(error).toMatchObject({ code: 'SENSITIVE_DATA_REJECTED' });
      expect(JSON.stringify(error)).not.toContain('customer secret');
    }
  });

  it('rejects a malformed report nested in an otherwise shaped envelope', () => {
    const envelope = {
      schemaVersion: 'n22.v1',
      evidenceType: 'n21_replay_diagnostic',
      sourceSchemaVersion: 'n21.v1',
      digestAlgorithm: 'sha256',
      report: { ...makeDiagnosticReport('passed-n18-deny'), interruptPayload: 'secret payload' },
      evidenceDigest: '0'.repeat(64),
    };

    const result = verifyEvidenceEnvelope(envelope);
    expect(result).toEqual({ schemaVersion: N22_SCHEMA_VERSION, status: 'invalid', reasonCode: 'SENSITIVE_DATA_REJECTED', digestMatch: false });
    expect(JSON.stringify(result)).not.toContain('secret payload');
  });

  it('distinguishes a generic unknown report field from a sensitive field', () => {
    const genericUnknown = {
      ...makeDiagnosticReport('passed-n17-normal'),
      unsupportedField: 'not allowed',
    };
    const sensitive = {
      ...makeDiagnosticReport('passed-n17-normal'),
      prompt: 'hidden instruction',
    };

    expect(() => sealReplayDiagnosticReport(genericUnknown)).toThrow(expect.objectContaining({ code: 'ENVELOPE_INVALID' }));
    expect(() => sealReplayDiagnosticReport(sensitive)).toThrow(expect.objectContaining({ code: 'SENSITIVE_DATA_REJECTED' }));
  });
});
