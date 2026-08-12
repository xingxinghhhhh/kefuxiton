import { N22_SCHEMA_VERSION } from '../src/evidence-contract.js';
import { sealReplayDiagnosticReport, verifyEvidenceEnvelope } from '../src/evidence-seal.js';
import { N21_EVIDENCE_CASE_IDS, makeDiagnosticReport } from './evidence-fixtures.js';

describe('N22 evidence envelope', () => {
  it.each(N21_EVIDENCE_CASE_IDS)('seals and verifies %s', (caseId) => {
    const envelope = sealReplayDiagnosticReport(makeDiagnosticReport(caseId));
    const verification = verifyEvidenceEnvelope(envelope);

    expect(Object.keys(envelope)).toEqual(['schemaVersion', 'evidenceType', 'sourceSchemaVersion', 'digestAlgorithm', 'report', 'evidenceDigest']);
    expect(envelope.schemaVersion).toBe(N22_SCHEMA_VERSION);
    expect(envelope.evidenceDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(verification).toEqual({ schemaVersion: N22_SCHEMA_VERSION, status: 'valid', reasonCode: 'NONE', digestMatch: true });
  });

  it('returns the same envelope for the same report', () => {
    const report = makeDiagnosticReport('passed-n17-normal');
    expect(sealReplayDiagnosticReport(report)).toEqual(sealReplayDiagnosticReport(report));
  });

  it('does not mutate the source report', () => {
    const report = makeDiagnosticReport('passed-n18-deny');
    const before = JSON.stringify(report);
    sealReplayDiagnosticReport(report);
    expect(JSON.stringify(report)).toBe(before);
  });
});
