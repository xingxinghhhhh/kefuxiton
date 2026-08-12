import { N20_CASE_IDS, N20_FIXTURE_VERSION, N20_SCHEMA_VERSION, type ReplayRequest } from '../src/replay-contract.js';
import { replay } from '../src/replay-runner.js';
import { FixedReplayFixtureRegistry } from './replay-fixtures.js';

const request = (caseId: (typeof N20_CASE_IDS)[number]): ReplayRequest => ({ schemaVersion: N20_SCHEMA_VERSION, caseId, fixtureVersion: N20_FIXTURE_VERSION });

describe('N20 replay isolation', () => {
  it('uses independent registries and in-memory state for separate runs', async () => {
    const first = await replay(request('n18-approve'), new FixedReplayFixtureRegistry());
    const second = await replay(request('n18-approve'), new FixedReplayFixtureRegistry());

    expect(first).toEqual(second);
    expect(first.actual?.finalResumeStatus).toBe('approved');
    expect(first.actual?.eventTypes.filter((eventType) => eventType === 'terminal')).toHaveLength(1);
  });

  it('keeps N17 replay free of checkpointer and N18 replay bounded to the current case', async () => {
    const n17 = await replay(request('n17-normal'), new FixedReplayFixtureRegistry());
    const n18Stale = await replay(request('n18-stale'), new FixedReplayFixtureRegistry());

    expect(n17.actual?.nodePath).not.toContain('request_human_decision');
    expect(n17.actual?.eventTypes).not.toContain('paused');
    expect(n18Stale.actual).toMatchObject({ finalRunStatus: 'rejected', finalResumeStatus: 'stale', errorCode: 'HUMAN_RESUME_STALE' });
    expect(n18Stale.actual?.eventCount).toBe(2);
  });
});
