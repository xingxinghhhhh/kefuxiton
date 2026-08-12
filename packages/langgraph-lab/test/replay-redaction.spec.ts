import { N20_CASE_IDS, N20_FIXTURE_VERSION, N20_SCHEMA_VERSION, type ReplayRequest } from '../src/replay-contract.js';
import { replay } from '../src/replay-runner.js';
import { FixedReplayFixtureRegistry } from './replay-fixtures.js';

describe('N20 replay redaction', () => {
  it('returns only safe summaries and never exposes fixture inputs or resume data', async () => {
    const request: ReplayRequest = { schemaVersion: N20_SCHEMA_VERSION, caseId: N20_CASE_IDS[7], fixtureVersion: N20_FIXTURE_VERSION };
    const result = await replay(request, new FixedReplayFixtureRegistry());
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('synthetic handoff');
    expect(serialized).not.toContain('approve_handoff');
    expect(serialized).not.toContain('handoff_review_required');
    expect(serialized).not.toContain('__interrupt__');
    expect(serialized).not.toContain('n20-n18-approve');
    expect(serialized).not.toContain('thread');
    expect(Object.keys(result.actual ?? {}).sort()).toEqual([
      'errorCode',
      'eventCount',
      'eventTypes',
      'finalResumeStatus',
      'finalRunStatus',
      'lastSequence',
      'nodePath',
      'routes',
      'schemaVersion',
      'terminalOutcome',
    ]);
  });
});
