import { N20_CASE_IDS, type N20CaseId } from '../src/replay-contract.js';
import type { EvidenceEnvelope } from '../src/evidence-contract.js';
import { sealReplayDiagnosticReport } from '../src/evidence-seal.js';
import type { EvidenceBundle } from '../src/bundle-contract.js';
import { sealEvidenceBundle } from '../src/bundle-seal.js';
import { makeDiagnosticReport } from './evidence-fixtures.js';

export function makeEvidenceEnvelopes(): EvidenceEnvelope[] {
  return N20_CASE_IDS.map((caseId) => sealReplayDiagnosticReport(makeDiagnosticReport(`passed-${caseId}`)));
}

export function cloneEnvelope(envelope: EvidenceEnvelope): EvidenceEnvelope {
  return structuredClone(envelope);
}

export function makeEvidenceBundle(envelopes: readonly EvidenceEnvelope[] = makeEvidenceEnvelopes()): EvidenceBundle {
  const result = sealEvidenceBundle(envelopes);
  if (result.status !== 'sealed' || result.bundle === null) throw new Error(`fixture sealing failed: ${result.reasonCode}`);
  return result.bundle;
}

export function replaceEnvelope(envelopes: readonly EvidenceEnvelope[], index: number, replacement: EvidenceEnvelope): EvidenceEnvelope[] {
  return envelopes.map((envelope, currentIndex) => currentIndex === index ? replacement : cloneEnvelope(envelope));
}

export function passedCaseId(index: number): N20CaseId {
  const caseId = N20_CASE_IDS[index];
  if (caseId === undefined) throw new Error(`missing N20 case at ${index}`);
  return caseId;
}
