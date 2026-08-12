import { N20_CASE_IDS, N20_FIXTURE_VERSION, N20_SCHEMA_VERSION, type N20CaseId, type ReplaySummary } from '../src/replay-contract.js';
import type { ReplayDiagnosticReport } from '../src/replay-diagnostic-contract.js';
import { FixedReplayFixtureRegistry } from './replay-fixtures.js';

export const N21_EVIDENCE_CASE_IDS = [
  ...N20_CASE_IDS.map((caseId) => `passed-${caseId}`),
  'golden-mismatch',
  'non-deterministic',
  'request-rejected',
  'fixture-unknown',
  'fixture-version',
  'fixture-hash',
  'sensitive-output',
  'internal-failure',
] as const;

export type N21EvidenceCaseId = (typeof N21_EVIDENCE_CASE_IDS)[number];

const registry = new FixedReplayFixtureRegistry();

export function makeDiagnosticReport(caseId: N21EvidenceCaseId): ReplayDiagnosticReport {
  if (caseId.startsWith('passed-')) return passedReport(caseId.slice('passed-'.length) as N20CaseId);
  if (caseId === 'golden-mismatch') return mismatchReport('golden_mismatch', 'GOLDEN_MISMATCH', 'TRACE_MISMATCH', 'golden');
  if (caseId === 'non-deterministic') return mismatchReport('non_deterministic', 'REPLAY_NON_DETERMINISTIC', 'REPLAY_NON_DETERMINISTIC', 'second_run');
  if (caseId === 'request-rejected') return rejectedReport('request_rejected', 'REPLAY_REQUEST_INVALID', 'REPLAY_REQUEST_INVALID', null, null);
  if (caseId === 'fixture-unknown') return rejectedReport('fixture_rejected', 'FIXTURE_REJECTED', 'FIXTURE_UNKNOWN', null, N20_FIXTURE_VERSION);
  if (caseId === 'fixture-version') return rejectedReport('fixture_rejected', 'FIXTURE_REJECTED', 'FIXTURE_VERSION_UNSUPPORTED', 'n17-normal', null);
  if (caseId === 'fixture-hash') return rejectedReport('fixture_rejected', 'FIXTURE_REJECTED', 'FIXTURE_HASH_MISMATCH', 'n17-normal', N20_FIXTURE_VERSION);
  if (caseId === 'sensitive-output') return rejectedReport('sensitive_output_rejected', 'SENSITIVE_DATA_REJECTED', 'SENSITIVE_DATA_REJECTED', null, null);
  return rejectedReport('internal_failure', 'REPLAY_INTERNAL', 'REPLAY_INTERNAL', null, null, 'internal_failure');
}
function passedReport(caseId: N20CaseId): ReplayDiagnosticReport {
  const summary = registry.get(caseId)?.expectedSummary;
  if (!summary) throw new Error(`missing fixture ${caseId}`);
  return {
    schemaVersion: 'n21.v1',
    caseId,
    fixtureVersion: N20_FIXTURE_VERSION,
    diagnosticStatus: 'passed',
    diagnosticKind: 'none',
    reasonCode: 'NONE',
    sourceErrorCode: null,
    compareBasis: 'none',
    determinism: { runsCompared: 2, matchesGolden: true, matchesSecondRun: true, deterministic: true, firstMismatchIndex: null },
    actualSummary: cloneSummary(summary),
    firstMismatch: null,
  };
}

function mismatchReport(
  diagnosticKind: 'golden_mismatch' | 'non_deterministic',
  reasonCode: 'GOLDEN_MISMATCH' | 'REPLAY_NON_DETERMINISTIC',
  sourceErrorCode: 'TRACE_MISMATCH' | 'REPLAY_NON_DETERMINISTIC',
  compareBasis: 'golden' | 'second_run',
): ReplayDiagnosticReport {
  return {
    schemaVersion: 'n21.v1',
    caseId: 'n17-normal',
    fixtureVersion: N20_FIXTURE_VERSION,
    diagnosticStatus: 'mismatch',
    diagnosticKind,
    reasonCode,
    sourceErrorCode,
    compareBasis,
    determinism: {
      runsCompared: 2,
      matchesGolden: compareBasis === 'second_run',
      matchesSecondRun: compareBasis === 'golden',
      deterministic: compareBasis === 'golden',
      firstMismatchIndex: 0,
    },
    actualSummary: passedReport('n17-normal').actualSummary,
    firstMismatch: {
      kind: compareBasis === 'golden' ? 'route' : 'event_type',
      index: 0,
      expected: compareBasis === 'golden' ? 'no_match' : 'node_entered',
      actual: compareBasis === 'golden' ? 'inspect_knowledge' : 'node_completed',
    },
  };
}

function rejectedReport(
  diagnosticKind: 'request_rejected' | 'fixture_rejected' | 'sensitive_output_rejected' | 'internal_failure',
  reasonCode: 'REPLAY_REQUEST_INVALID' | 'FIXTURE_REJECTED' | 'SENSITIVE_DATA_REJECTED' | 'REPLAY_INTERNAL',
  sourceErrorCode: 'REPLAY_REQUEST_INVALID' | 'FIXTURE_UNKNOWN' | 'FIXTURE_VERSION_UNSUPPORTED' | 'FIXTURE_HASH_MISMATCH' | 'SENSITIVE_DATA_REJECTED' | 'REPLAY_INTERNAL',
  caseId: N20CaseId | null,
  fixtureVersion: typeof N20_FIXTURE_VERSION | null,
  diagnosticStatus: 'rejected' | 'internal_failure' = 'rejected',
): ReplayDiagnosticReport {
  return {
    schemaVersion: 'n21.v1',
    caseId,
    fixtureVersion,
    diagnosticStatus,
    diagnosticKind,
    reasonCode,
    sourceErrorCode,
    compareBasis: 'none',
    determinism: null,
    actualSummary: null,
    firstMismatch: null,
  };
}

function cloneSummary(summary: ReplaySummary): ReplaySummary {
  return {
    ...summary,
    eventTypes: [...summary.eventTypes],
    nodePath: [...summary.nodePath],
    routes: [...summary.routes],
  };
}
