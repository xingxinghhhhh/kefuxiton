import { N20_CASE_IDS, N20_FIXTURE_VERSION, N20_SCHEMA_VERSION, type ReplayRequest } from '../src/replay-contract.js';
import { replay } from '../src/replay-runner.js';
import { FixedReplayFixtureRegistry } from './replay-fixtures.js';

const request = (caseId: (typeof N20_CASE_IDS)[number]): ReplayRequest => ({
  schemaVersion: N20_SCHEMA_VERSION,
  caseId,
  fixtureVersion: N20_FIXTURE_VERSION,
});

describe('N20 deterministic replay', () => {
  it.each(N20_CASE_IDS)('replays %s twice against its fixed golden summary', async (caseId) => {
    const result = await replay(request(caseId), new FixedReplayFixtureRegistry());

    expect(result).toMatchObject({ status: 'passed', caseId, fixtureVersion: N20_FIXTURE_VERSION, errorCode: null });
    expect(result.actual?.eventCount).toBeGreaterThan(0);
    expect(result.report).toMatchObject({ runsCompared: 2, matchesGolden: true, matchesSecondRun: true, deterministic: true, firstMismatchIndex: null });
    expect(result.mismatch).toBeNull();
  });

  it('rejects unknown, malformed, and unsupported replay requests before fixture execution', async () => {
    const registry = new FixedReplayFixtureRegistry();
    const unknown = await replay({ schemaVersion: N20_SCHEMA_VERSION, caseId: 'n20-unknown', fixtureVersion: N20_FIXTURE_VERSION }, registry);
    const extra = await replay({ ...request('n17-normal'), inputContent: 'must not be accepted' }, registry);
    const unsupported = await replay({ schemaVersion: N20_SCHEMA_VERSION, caseId: 'n17-normal', fixtureVersion: 'n20.v0' }, registry);

    expect(unknown).toMatchObject({ status: 'rejected', errorCode: 'FIXTURE_UNKNOWN' });
    expect(extra).toMatchObject({ status: 'rejected', errorCode: 'REPLAY_REQUEST_INVALID' });
    expect(unsupported).toMatchObject({ status: 'rejected', errorCode: 'FIXTURE_VERSION_UNSUPPORTED' });
  });

  it('rejects a descriptor hash mismatch without executing the fixture', async () => {
    const registry = new FixedReplayFixtureRegistry();
    const fixture = registry.get('n17-normal');
    if (!fixture) throw new Error('fixture missing from test registry');
    let executed = false;
    fixture.execute = async () => {
      executed = true;
      throw new Error('fixture must not run');
    };
    fixture.descriptorHash = 'tampered';

    const result = await replay(request('n17-normal'), registry);

    expect(result).toMatchObject({ status: 'rejected', errorCode: 'FIXTURE_HASH_MISMATCH' });
    expect(executed).toBe(false);
  });

  it('reports the first mismatch with a constrained field and index', async () => {
    const registry = new FixedReplayFixtureRegistry();
    const fixture = registry.get('n17-normal');
    if (!fixture) throw new Error('fixture missing from test registry');
    fixture.expectedSummary = { ...fixture.expectedSummary, routes: ['no_match'] };

    const result = await replay(request('n17-normal'), registry);

    expect(result.status).toBe('mismatch');
    expect(result.errorCode).toBe('TRACE_MISMATCH');
    expect(result.mismatch).toMatchObject({ kind: 'route', index: 0, expected: 'no_match', actual: 'inspect_knowledge' });
    expect(result.report).toMatchObject({ matchesGolden: false, matchesSecondRun: true, deterministic: true, firstMismatchIndex: 0 });
  });
});
