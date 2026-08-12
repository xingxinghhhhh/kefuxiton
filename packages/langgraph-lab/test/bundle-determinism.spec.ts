import type { EvidenceEnvelope } from '../src/evidence-contract.js';
import { sealEvidenceBundle, verifyEvidenceBundle } from '../src/bundle-seal.js';
import { cloneEnvelope, makeEvidenceEnvelopes } from './bundle-fixtures.js';

function reorderEnvelope(envelope: EvidenceEnvelope): EvidenceEnvelope {
  const report = envelope.report;
  const reorderedReport = {
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
  return {
    evidenceDigest: envelope.evidenceDigest,
    report: reorderedReport,
    digestAlgorithm: envelope.digestAlgorithm,
    sourceSchemaVersion: envelope.sourceSchemaVersion,
    evidenceType: envelope.evidenceType,
    schemaVersion: envelope.schemaVersion,
  };
}

describe('N24 bundle determinism', () => {
  it('returns identical bundles for repeated seals', () => {
    const envelopes = makeEvidenceEnvelopes();
    expect(sealEvidenceBundle(envelopes)).toEqual(sealEvidenceBundle(envelopes));
  });

  it('ignores equivalent envelope property insertion order', () => {
    const original = makeEvidenceEnvelopes();
    const reordered = original.map((envelope, index) => index === 0 ? reorderEnvelope(envelope) : cloneEnvelope(envelope));

    expect(sealEvidenceBundle(reordered)).toEqual(sealEvidenceBundle(original));
  });

  it('rejects reordered input instead of silently sorting it', () => {
    const envelopes = makeEvidenceEnvelopes();
    [envelopes[0], envelopes[1]] = [envelopes[1], envelopes[0]];

    expect(sealEvidenceBundle(envelopes)).toMatchObject({ status: 'rejected', reasonCode: 'CASE_ORDER_INVALID', bundle: null });
  });

  it('keeps repeated verification deterministic', () => {
    const envelopes = makeEvidenceEnvelopes();
    const sealed = sealEvidenceBundle(envelopes);
    if (sealed.bundle === null) throw new Error('expected bundle');

    expect(verifyEvidenceBundle(sealed.bundle, envelopes)).toEqual(verifyEvidenceBundle(sealed.bundle, envelopes));
  });
});
