import { N22_SCHEMA_VERSION, type EvidenceEnvelope } from '../src/evidence-contract.js';
import { sealReplayDiagnosticReport, verifyEvidenceEnvelope } from '../src/evidence-seal.js';
import { makeDiagnosticReport } from './evidence-fixtures.js';

const original = sealReplayDiagnosticReport(makeDiagnosticReport('passed-n17-normal'));

function cloneEnvelope(envelope: EvidenceEnvelope): EvidenceEnvelope {
  return JSON.parse(JSON.stringify(envelope)) as EvidenceEnvelope;
}

describe('N22 evidence tamper and version checks', () => {
  it('rejects a changed digest', () => {
    const tampered = cloneEnvelope(original);
    tampered.evidenceDigest = `${tampered.evidenceDigest.slice(0, -1)}${tampered.evidenceDigest.endsWith('0') ? '1' : '0'}`;

    expect(verifyEvidenceEnvelope(tampered)).toMatchObject({ status: 'invalid', reasonCode: 'DIGEST_MISMATCH', digestMatch: false });
  });

  it('rejects a changed safe report field as a digest mismatch', () => {
    const tampered = cloneEnvelope(original);
    tampered.report = { ...tampered.report, diagnosticKind: 'golden_mismatch', diagnosticStatus: 'mismatch', reasonCode: 'GOLDEN_MISMATCH', sourceErrorCode: 'TRACE_MISMATCH', compareBasis: 'golden' };

    expect(verifyEvidenceEnvelope(tampered)).toMatchObject({ status: 'invalid', reasonCode: 'DIGEST_MISMATCH' });
  });

  it('rejects an unsupported source schema before digest comparison', () => {
    const tampered = cloneEnvelope(original);
    tampered.sourceSchemaVersion = 'n20.v1' as 'n21.v1';

    expect(verifyEvidenceEnvelope(tampered)).toMatchObject({ status: 'invalid', reasonCode: 'SOURCE_VERSION_UNSUPPORTED', digestMatch: false });
  });

  it('rejects unknown envelope fields without echoing them', () => {
    const tampered = { ...original, unsupportedField: 'not allowed' } as EvidenceEnvelope & { unsupportedField: string };

    const result = verifyEvidenceEnvelope(tampered);
    expect(result).toMatchObject({ schemaVersion: N22_SCHEMA_VERSION, status: 'invalid', reasonCode: 'ENVELOPE_INVALID', digestMatch: false });
    expect(JSON.stringify(result)).not.toContain('not allowed');
  });

  it('rejects an oversized envelope before processing the report', () => {
    const tampered = cloneEnvelope(original);
    tampered.evidenceDigest = 'a'.repeat(25_000);

    expect(verifyEvidenceEnvelope(tampered)).toMatchObject({ status: 'invalid', reasonCode: 'SIZE_LIMIT_EXCEEDED', digestMatch: false });
  });
});
