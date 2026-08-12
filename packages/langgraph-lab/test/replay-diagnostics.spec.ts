import {
  N20_FIXTURE_VERSION,
  N20_SCHEMA_VERSION,
  type N20CaseId,
  type ReplayResult,
  type ReplaySummary,
} from '../src/replay-contract.js';
import { diagnoseReplayResult } from '../src/replay-diagnostics.js';
import { FixedReplayFixtureRegistry } from './replay-fixtures.js';

const registry = new FixedReplayFixtureRegistry();

function passedResult(caseId: N20CaseId): ReplayResult {
  const summary = registry.get(caseId)?.expectedSummary;
  if (!summary) throw new Error(`missing fixture ${caseId}`);
  return {
    schemaVersion: N20_SCHEMA_VERSION,
    caseId,
    fixtureVersion: N20_FIXTURE_VERSION,
    status: 'passed',
    actual: cloneSummary(summary),
    report: {
      schemaVersion: N20_SCHEMA_VERSION,
      caseId,
      fixtureVersion: N20_FIXTURE_VERSION,
      runsCompared: 2,
      matchesGolden: true,
      matchesSecondRun: true,
      deterministic: true,
      firstMismatchIndex: null,
    },
    mismatch: null,
    errorCode: null,
  };
}

function rejectedResult(errorCode: NonNullable<ReplayResult['errorCode']>, caseId: N20CaseId | null = null, fixtureVersion: typeof N20_FIXTURE_VERSION | null = null): ReplayResult {
  return {
    schemaVersion: N20_SCHEMA_VERSION,
    caseId,
    fixtureVersion,
    status: 'rejected',
    actual: null,
    report: null,
    mismatch: null,
    errorCode,
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

describe('N21 replay diagnostic mapping', () => {
  it.each([
    'n17-normal',
    'n17-injection',
    'n17-no-match',
    'n17-unsafe-knowledge',
    'n17-retrieval-failure',
    'n17-invalid-retrieval',
    'n18-handoff-pause',
    'n18-approve',
    'n18-deny',
    'n18-missing',
    'n18-invalid',
    'n18-duplicate',
    'n18-stale',
  ] as N20CaseId[])('maps %s to a stable passed report', (caseId) => {
    const result = passedResult(caseId);
    const first = diagnoseReplayResult(result);
    const second = diagnoseReplayResult(result);

    expect(first).toMatchObject({
      schemaVersion: 'n21.v1',
      caseId,
      fixtureVersion: N20_FIXTURE_VERSION,
      diagnosticStatus: 'passed',
      diagnosticKind: 'none',
      reasonCode: 'NONE',
      compareBasis: 'none',
      sourceErrorCode: null,
      firstMismatch: null,
    });
    expect(first).toEqual(second);
    expect(first.actualSummary?.schemaVersion).toBe('n19.v1');
  });

  it('distinguishes golden mismatch from non-determinism', () => {
    const golden = passedResult('n17-normal');
    const goldenMismatch: ReplayResult = {
      ...golden,
      status: 'mismatch',
      errorCode: 'TRACE_MISMATCH',
      report: { ...golden.report!, matchesGolden: false, firstMismatchIndex: 0 },
      mismatch: { kind: 'route', index: 0, expected: 'no_match', actual: 'inspect_knowledge' },
    };
    const nonDeterministic: ReplayResult = {
      ...goldenMismatch,
      errorCode: 'REPLAY_NON_DETERMINISTIC',
      report: { ...goldenMismatch.report!, matchesGolden: true, matchesSecondRun: false, deterministic: false },
      mismatch: { kind: 'event_type', index: 1, expected: 'node_entered', actual: 'node_completed' },
    };

    expect(diagnoseReplayResult(goldenMismatch)).toMatchObject({
      diagnosticStatus: 'mismatch',
      diagnosticKind: 'golden_mismatch',
      reasonCode: 'GOLDEN_MISMATCH',
      compareBasis: 'golden',
      firstMismatch: { kind: 'route', index: 0, expected: 'no_match', actual: 'inspect_knowledge' },
    });
    expect(diagnoseReplayResult(nonDeterministic)).toMatchObject({
      diagnosticStatus: 'mismatch',
      diagnosticKind: 'non_deterministic',
      reasonCode: 'REPLAY_NON_DETERMINISTIC',
      compareBasis: 'second_run',
      firstMismatch: { kind: 'event_type', index: 1 },
    });
  });

  it('maps request, fixture, and internal rejection classes', () => {
    expect(diagnoseReplayResult(rejectedResult('REPLAY_REQUEST_INVALID'))).toMatchObject({
      diagnosticStatus: 'rejected', diagnosticKind: 'request_rejected', reasonCode: 'REPLAY_REQUEST_INVALID', compareBasis: 'none',
    });
    expect(diagnoseReplayResult(rejectedResult('FIXTURE_UNKNOWN'))).toMatchObject({
      diagnosticStatus: 'rejected', diagnosticKind: 'fixture_rejected', reasonCode: 'FIXTURE_REJECTED', sourceErrorCode: 'FIXTURE_UNKNOWN',
    });
    expect(diagnoseReplayResult(rejectedResult('FIXTURE_VERSION_UNSUPPORTED', 'n17-normal'))).toMatchObject({
      diagnosticStatus: 'rejected', diagnosticKind: 'fixture_rejected', reasonCode: 'FIXTURE_REJECTED', caseId: 'n17-normal',
    });
    expect(diagnoseReplayResult(rejectedResult('FIXTURE_HASH_MISMATCH', 'n17-normal', N20_FIXTURE_VERSION))).toMatchObject({
      diagnosticStatus: 'rejected', diagnosticKind: 'fixture_rejected', reasonCode: 'FIXTURE_REJECTED', fixtureVersion: N20_FIXTURE_VERSION,
    });
    expect(diagnoseReplayResult(rejectedResult('REPLAY_INTERNAL'))).toMatchObject({
      diagnosticStatus: 'internal_failure', diagnosticKind: 'internal_failure', reasonCode: 'REPLAY_INTERNAL',
    });
  });
});
