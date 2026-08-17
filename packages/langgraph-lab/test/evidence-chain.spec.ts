import { N20_CASE_IDS } from '../src/replay-contract.js';
import { N22_SCHEMA_VERSION } from '../src/evidence-contract.js';
import { verifyEvidenceEnvelope } from '../src/evidence-seal.js';
import { N23_CASE_COUNT, N23_SCHEMA_VERSION } from '../src/bundle-contract.js';
import { sealEvidenceBundle, verifyEvidenceBundle } from '../src/bundle-seal.js';
import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { createN27EvidenceChainInput, N27_CASE_SCENARIO_IDS } from './evidence-chain-fixtures.js';

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

describe('N27 end-to-end evidence chain consistency', () => {
  it('uses the fixed N20 case order as the only chain identity order', () => {
    expect(N27_CASE_SCENARIO_IDS).toEqual(N20_CASE_IDS.map((caseId) => `case-${caseId}`));
    expect(N27_CASE_SCENARIO_IDS).toHaveLength(N23_CASE_COUNT);
  });

  it.each(N20_CASE_IDS)('keeps the envelope, item, bundle, and snapshot chain for %s', (caseId) => {
    const input = createN27EvidenceChainInput(caseId);
    const index = N20_CASE_IDS.indexOf(caseId);
    const envelope = input.envelopes[index];
    const item = input.bundle.items[index];
    if (envelope === undefined || item === undefined) throw new Error(`N27 fixture is missing ${caseId}`);

    expect(verifyEvidenceEnvelope(envelope)).toEqual({
      schemaVersion: N22_SCHEMA_VERSION,
      status: 'valid',
      reasonCode: 'NONE',
      digestMatch: true,
    });
    expect(item).toEqual({ caseId, evidenceDigest: envelope.evidenceDigest });

    const resealed = sealEvidenceBundle(input.envelopes);
    expect(resealed.status).toBe('sealed');
    expect(resealed.reasonCode).toBe('NONE');
    expect(resealed.bundle?.bundleDigest).toBe(input.bundle.bundleDigest);

    const verification = verifyEvidenceBundle(input.bundle, input.envelopes);
    expect(verification).toEqual({
      schemaVersion: N23_SCHEMA_VERSION,
      status: 'valid',
      reasonCode: 'NONE',
      bundleDigestMatch: true,
      validatedCaseCount: N23_CASE_COUNT,
    });

    const snapshot = buildEvidenceGateSnapshot(input.bundle, input.envelopes);
    expect(snapshot).toMatchObject({
      status: 'passed',
      bundleSchemaVersion: N23_SCHEMA_VERSION,
      validatedCaseCount: N23_CASE_COUNT,
      bundleDigest: input.bundle.bundleDigest,
      bundleDigestMatch: true,
      reasonCode: 'NONE',
    });
    expect(Object.keys(snapshot)).toEqual(SNAPSHOT_KEYS);
    const serializedSnapshot = JSON.stringify(snapshot);
    expect(serializedSnapshot).not.toContain('caseId');
    expect(serializedSnapshot).not.toContain('report');
    expect(serializedSnapshot).not.toContain('prompt');
    expect(serializedSnapshot).not.toContain('Token');
  });
});
