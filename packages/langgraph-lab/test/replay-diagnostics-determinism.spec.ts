import { N20_FIXTURE_VERSION, N20_SCHEMA_VERSION, type ReplayResult } from '../src/replay-contract.js';
import { diagnoseReplayResult } from '../src/replay-diagnostics.js';

const passedResult: ReplayResult = {
  schemaVersion: N20_SCHEMA_VERSION,
  caseId: 'n18-deny',
  fixtureVersion: N20_FIXTURE_VERSION,
  status: 'passed',
  actual: {
    schemaVersion: 'n19.v1',
    eventTypes: ['run_started', 'terminal'],
    nodePath: ['safe_unavailable'],
    routes: ['safe_unavailable'],
    finalRunStatus: 'completed',
    finalResumeStatus: 'denied',
    terminalOutcome: 'safe_unavailable',
    errorCode: null,
    eventCount: 2,
    lastSequence: 2,
  },
  report: {
    schemaVersion: N20_SCHEMA_VERSION,
    caseId: 'n18-deny',
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

describe('N21 diagnostic determinism and immutability', () => {
  it('returns identical reports and does not mutate the replay result', () => {
    const before = JSON.stringify(passedResult);
    const first = diagnoseReplayResult(passedResult);
    const second = diagnoseReplayResult(passedResult);

    expect(first).toEqual(second);
    expect(JSON.stringify(passedResult)).toBe(before);
    expect(JSON.stringify(first).length).toBeLessThanOrEqual(16 * 1024);
  });
});
