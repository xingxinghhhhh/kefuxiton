import { N20_SCHEMA_VERSION, type ReplayResult } from '../src/replay-contract.js';
import { diagnoseReplayResult } from '../src/replay-diagnostics.js';

function rejectedWithUnknownField(): ReplayResult {
  return {
    schemaVersion: N20_SCHEMA_VERSION,
    caseId: 'n17-normal',
    fixtureVersion: 'n20.v1',
    status: 'rejected',
    actual: null,
    report: null,
    mismatch: null,
    errorCode: 'REPLAY_INTERNAL',
    inputContent: 'customer secret',
  } as ReplayResult & { inputContent: string };
}

describe('N21 diagnostic redaction and fail-closed validation', () => {
  it('does not echo unknown top-level input fields', () => {
    const report = diagnoseReplayResult(rejectedWithUnknownField());

    expect(report).toMatchObject({
      diagnosticStatus: 'rejected',
      diagnosticKind: 'sensitive_output_rejected',
      reasonCode: 'SENSITIVE_DATA_REJECTED',
      actualSummary: null,
      firstMismatch: null,
    });
    expect(JSON.stringify(report)).not.toContain('customer secret');
  });

  it.each([
    {
      name: 'unknown summary field',
      result: {
        schemaVersion: N20_SCHEMA_VERSION,
        caseId: 'n17-normal',
        fixtureVersion: 'n20.v1',
        status: 'passed',
        actual: { rawInput: 'secret' },
        report: null,
        mismatch: null,
        errorCode: null,
      },
    },
    {
      name: 'oversized summary array',
      result: {
        schemaVersion: N20_SCHEMA_VERSION,
        caseId: 'n17-normal',
        fixtureVersion: 'n20.v1',
        status: 'passed',
        actual: {
          schemaVersion: 'n19.v1', eventTypes: Array.from({ length: 33 }, () => 'terminal'), nodePath: [], routes: [],
          finalRunStatus: 'completed', finalResumeStatus: 'not_started', terminalOutcome: 'knowledge_answer', errorCode: null, eventCount: 33, lastSequence: 33,
        },
        report: null,
        mismatch: null,
        errorCode: null,
      },
    },
    {
      name: 'unknown mismatch value',
      result: {
        schemaVersion: N20_SCHEMA_VERSION,
        caseId: 'n17-normal',
        fixtureVersion: 'n20.v1',
        status: 'mismatch',
        actual: null,
        report: null,
        mismatch: { kind: 'route', index: 0, expected: 'customer secret', actual: 'inspect_knowledge' },
        errorCode: 'TRACE_MISMATCH',
      },
    },
  ])('rejects $name without exposing the malformed payload', ({ result }) => {
    const report = diagnoseReplayResult(result as ReplayResult);

    expect(report).toMatchObject({ diagnosticKind: 'sensitive_output_rejected', reasonCode: 'SENSITIVE_DATA_REJECTED' });
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(JSON.stringify(report)).not.toContain('customer');
  });
});
