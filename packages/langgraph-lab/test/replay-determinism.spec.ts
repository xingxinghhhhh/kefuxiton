import { N20_CASE_IDS, N20_FIXTURE_VERSION, N20_SCHEMA_VERSION, type ReplayRequest } from '../src/replay-contract.js';
import { compareSummary, replay } from '../src/replay-runner.js';
import { FixedReplayFixtureRegistry } from './replay-fixtures.js';

describe('N20 replay determinism', () => {
  it('compares N19-safe fields only and identifies the first scalar mismatch', () => {
    const registry = new FixedReplayFixtureRegistry();
    const expected = registry.get('n17-normal')?.expectedSummary;
    if (!expected) throw new Error('fixture missing from test registry');
    const actual = { ...expected, finalRunStatus: 'rejected' as const };

    expect(compareSummary(expected, actual)).toEqual({ kind: 'run_status', index: null, expected: 'completed', actual: 'rejected' });
  });

  it.each(N20_CASE_IDS)('keeps %s stable across independently created replay registries', async (caseId) => {
    const request: ReplayRequest = { schemaVersion: N20_SCHEMA_VERSION, caseId, fixtureVersion: N20_FIXTURE_VERSION };
    const first = await replay(request, new FixedReplayFixtureRegistry());
    const second = await replay(request, new FixedReplayFixtureRegistry());

    expect(first.report?.matchesSecondRun).toBe(true);
    expect(first.actual).toEqual(second.actual);
  });
});
