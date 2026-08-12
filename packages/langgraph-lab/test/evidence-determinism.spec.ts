import { sealReplayDiagnosticReport, verifyEvidenceEnvelope } from '../src/evidence-seal.js';
import { makeDiagnosticReport } from './evidence-fixtures.js';

describe('N22 canonical evidence determinism', () => {
  it('canonicalizes report object insertion order', () => {
    const report = makeDiagnosticReport('passed-n17-normal');
    const reordered = {
      firstMismatch: report.firstMismatch,
      actualSummary: report.actualSummary,
      determinism: report.determinism,
      compareBasis: report.compareBasis,
      sourceErrorCode: report.sourceErrorCode,
      reasonCode: report.reasonCode,
      diagnosticKind: report.diagnosticKind,
      diagnosticStatus: report.diagnosticStatus,
      fixtureVersion: report.fixtureVersion,
      caseId: report.caseId,
      schemaVersion: report.schemaVersion,
    };

    expect(sealReplayDiagnosticReport(report).evidenceDigest).toBe(sealReplayDiagnosticReport(reordered).evidenceDigest);
  });

  it('preserves array order as evidence', () => {
    const report = makeDiagnosticReport('passed-n17-normal');
    const changed = {
      ...report,
      actualSummary: report.actualSummary && { ...report.actualSummary, eventTypes: [...report.actualSummary.eventTypes].reverse() },
    };
    const original = sealReplayDiagnosticReport(report);
    const altered = sealReplayDiagnosticReport(changed);

    expect(altered.evidenceDigest).not.toBe(original.evidenceDigest);
    expect(verifyEvidenceEnvelope(altered).status).toBe('valid');
  });
});
