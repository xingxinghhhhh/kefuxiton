import { N20_CASE_IDS } from '../src/replay-contract.js';
import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';

export const N26_SCENARIO_IDS = [
  'valid',
  'missing_case',
  'duplicate_case',
  'order_invalid',
  'unknown_case',
  'case_id_mismatch',
  'bundle_source_invalid',
  'envelope_source_invalid',
  'bundle_algorithm_invalid',
  'envelope_algorithm_invalid',
  'envelope_digest_tamper',
  'bundle_digest_tamper',
  'sensitive_or_unknown_field',
  'malformed_or_empty',
] as const;
export type N26ScenarioId = (typeof N26_SCENARIO_IDS)[number];

export interface N26ReplayInput {
  bundle: unknown;
  envelopes: readonly unknown[];
  expectedStatus: 'passed' | 'blocked';
}

export function createN26ReplayInput(scenarioId: N26ScenarioId): N26ReplayInput {
  const envelopes = makeEvidenceEnvelopes();
  const bundle = makeEvidenceBundle(envelopes);

  switch (scenarioId) {
    case 'valid':
      return { bundle, envelopes, expectedStatus: 'passed' };
    case 'missing_case':
      return { bundle, envelopes: envelopes.slice(0, -1), expectedStatus: 'blocked' };
    case 'duplicate_case':
      return { bundle, envelopes: [envelopes[0], ...envelopes.slice(0, -1)], expectedStatus: 'blocked' };
    case 'order_invalid':
      return { bundle: { ...bundle, items: [...bundle.items].reverse() }, envelopes, expectedStatus: 'blocked' };
    case 'unknown_case':
      return {
        bundle: { ...bundle, items: [{ ...bundle.items[0], caseId: 'unknown-case' }, ...bundle.items.slice(1)] },
        envelopes,
        expectedStatus: 'blocked',
      };
    case 'case_id_mismatch':
      return { bundle, envelopes: [{ ...envelopes[0], report: { ...envelopes[0].report, caseId: N20_CASE_IDS[1] } }, ...envelopes.slice(1)], expectedStatus: 'blocked' };
    case 'bundle_source_invalid':
      return { bundle: { ...bundle, sourceSchemaVersion: 'n21.v1' }, envelopes, expectedStatus: 'blocked' };
    case 'envelope_source_invalid':
      return { bundle, envelopes: [{ ...envelopes[0], sourceSchemaVersion: 'n20.v1' }, ...envelopes.slice(1)], expectedStatus: 'blocked' };
    case 'bundle_algorithm_invalid':
      return { bundle: { ...bundle, digestAlgorithm: 'sha512' }, envelopes, expectedStatus: 'blocked' };
    case 'envelope_algorithm_invalid':
      return { bundle, envelopes: [{ ...envelopes[0], digestAlgorithm: 'sha512' }, ...envelopes.slice(1)], expectedStatus: 'blocked' };
    case 'envelope_digest_tamper':
      return { bundle, envelopes: [{ ...envelopes[0], evidenceDigest: '0'.repeat(64) }, ...envelopes.slice(1)], expectedStatus: 'blocked' };
    case 'bundle_digest_tamper':
      return { bundle: { ...bundle, bundleDigest: '0'.repeat(64) }, envelopes, expectedStatus: 'blocked' };
    case 'sensitive_or_unknown_field':
      return { bundle: { ...bundle, prompt: 'must not be returned' }, envelopes, expectedStatus: 'blocked' };
    case 'malformed_or_empty':
      return { bundle: null, envelopes: [], expectedStatus: 'blocked' };
  }
}
