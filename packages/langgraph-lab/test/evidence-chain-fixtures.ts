import { N20_CASE_IDS, type N20CaseId } from '../src/replay-contract.js';
import type { EvidenceEnvelope } from '../src/evidence-contract.js';
import type { EvidenceBundle } from '../src/bundle-contract.js';
import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';

export const N27_CASE_SCENARIO_IDS = [
  'case-n17-normal',
  'case-n17-injection',
  'case-n17-no-match',
  'case-n17-unsafe-knowledge',
  'case-n17-retrieval-failure',
  'case-n17-invalid-retrieval',
  'case-n18-handoff-pause',
  'case-n18-approve',
  'case-n18-deny',
  'case-n18-missing',
  'case-n18-invalid',
  'case-n18-duplicate',
  'case-n18-stale',
] as const;

export type N27CaseScenarioId = (typeof N27_CASE_SCENARIO_IDS)[number];

export const N27_TAMPER_SCENARIO_IDS = [
  'tamper-envelope-digest',
  'tamper-bundle-item-digest',
  'tamper-bundle-digest',
  'tamper-case-order',
] as const;

export type N27TamperScenarioId = (typeof N27_TAMPER_SCENARIO_IDS)[number];

export interface N27EvidenceChainInput {
  scenarioId: N27CaseScenarioId;
  caseId: N20CaseId;
  envelopes: EvidenceEnvelope[];
  bundle: EvidenceBundle;
}

export interface N27TamperedEvidenceChainInput {
  scenarioId: N27TamperScenarioId;
  envelopes: EvidenceEnvelope[];
  bundle: EvidenceBundle;
}

export function createN27EvidenceChainInput(caseId: N20CaseId): N27EvidenceChainInput {
  const envelopes = makeEvidenceEnvelopes();
  const bundle = makeEvidenceBundle(envelopes);
  const scenarioId = `case-${caseId}` as N27CaseScenarioId;
  return { scenarioId, caseId, envelopes, bundle };
}

export function createN27TamperedInput(scenarioId: N27TamperScenarioId): N27TamperedEvidenceChainInput {
  const base = createN27EvidenceChainInput(N20_CASE_IDS[0]);
  const firstEnvelope = base.envelopes[0];
  const firstItem = base.bundle.items[0];
  if (firstEnvelope === undefined || firstItem === undefined) throw new Error('N27 fixture is missing the first case');

  switch (scenarioId) {
    case 'tamper-envelope-digest':
      return {
        scenarioId,
        bundle: structuredClone(base.bundle),
        envelopes: base.envelopes.map((envelope, index) => index === 0 ? { ...envelope, evidenceDigest: '0'.repeat(64) } : structuredClone(envelope)),
      };
    case 'tamper-bundle-item-digest':
      return {
        scenarioId,
        bundle: {
          ...base.bundle,
          items: base.bundle.items.map((item, index) => index === 0 ? { ...item, evidenceDigest: '0'.repeat(64) } : { ...item }),
        },
        envelopes: structuredClone(base.envelopes),
      };
    case 'tamper-bundle-digest':
      return { scenarioId, bundle: { ...base.bundle, bundleDigest: '0'.repeat(64) }, envelopes: structuredClone(base.envelopes) };
    case 'tamper-case-order':
      return {
        scenarioId,
        bundle: { ...base.bundle, items: [...base.bundle.items].reverse().map((item) => ({ ...item })) },
        envelopes: structuredClone(base.envelopes),
      };
  }
}
