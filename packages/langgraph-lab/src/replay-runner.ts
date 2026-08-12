import type { WorkflowPorts } from './ports.js';
import { createTracedHumanReviewSession } from './traced-n18.js';
import { runTracedN17Workflow } from './traced-n17.js';
import type { ExecutionTrace, TraceEvent } from './trace-contract.js';
import {
  N18_REPLAY_ACTIONS,
  N20_FIXTURE_VERSION,
  N20_SCHEMA_VERSION,
  type DeterminismReport,
  type N18ReplayAction,
  type N20CaseId,
  type N20ReplayErrorCode,
  type ReplayComparableValue,
  type ReplayFixtureDefinition,
  type ReplayFixtureExecutionContext,
  type ReplayFixtureRegistry,
  type ReplayMismatch,
  type ReplayMismatchKind,
  type ReplayResult,
  type ReplaySummary,
} from './replay-contract.js';
import { isN20CaseId } from './replay-contract.js';

const REQUEST_KEYS = ['caseId', 'fixtureVersion', 'schemaVersion'] as const;

export async function replay(request: unknown, registry: ReplayFixtureRegistry): Promise<ReplayResult> {
  const parsed = parseReplayRequest(request);
  if (!parsed) return rejected(null, null, 'REPLAY_REQUEST_INVALID');
  if (parsed.schemaVersion !== N20_SCHEMA_VERSION) return rejected(null, null, 'REPLAY_REQUEST_INVALID');
  if (parsed.fixtureVersion !== N20_FIXTURE_VERSION) return rejected(isN20CaseId(parsed.caseId) ? parsed.caseId : null, null, 'FIXTURE_VERSION_UNSUPPORTED');
  if (!isN20CaseId(parsed.caseId)) return rejected(null, N20_FIXTURE_VERSION, 'FIXTURE_UNKNOWN');

  const fixture = registry.get(parsed.caseId);
  if (!fixture) return rejected(parsed.caseId, parsed.fixtureVersion, 'FIXTURE_UNKNOWN');
  if (fixture.fixtureVersion !== parsed.fixtureVersion) {
    return rejected(parsed.caseId, parsed.fixtureVersion, 'FIXTURE_VERSION_UNSUPPORTED');
  }
  if (fixture.descriptorHash !== registry.expectedDescriptorHash(parsed.caseId)) {
    return rejected(parsed.caseId, parsed.fixtureVersion, 'FIXTURE_HASH_MISMATCH');
  }

  try {
    const first = await executeFixture(fixture, `${parsed.caseId}-run-1`);
    const second = await executeFixture(fixture, `${parsed.caseId}-run-2`);
    const expected = toComparableSummary(fixture.expectedSummary);
    const firstSummary = toReplaySummary(first);
    const secondSummary = toReplaySummary(second);
    const goldenMismatch = compareSummary(expected, firstSummary);
    const deterministicMismatch = compareSummary(firstSummary, secondSummary);
    const mismatch = goldenMismatch ?? deterministicMismatch;
    const report: DeterminismReport = {
      schemaVersion: N20_SCHEMA_VERSION,
      caseId: parsed.caseId,
      fixtureVersion: parsed.fixtureVersion,
      runsCompared: 2,
      matchesGolden: goldenMismatch === null,
      matchesSecondRun: deterministicMismatch === null,
      deterministic: deterministicMismatch === null,
      firstMismatchIndex: mismatch?.index ?? null,
    };
    if (mismatch) {
      const mismatchErrorCode = goldenMismatch ? 'TRACE_MISMATCH' : 'REPLAY_NON_DETERMINISTIC';
      return {
        schemaVersion: N20_SCHEMA_VERSION,
        caseId: parsed.caseId,
        fixtureVersion: parsed.fixtureVersion,
        status: 'mismatch',
        actual: firstSummary,
        report,
        mismatch,
        errorCode: mismatchErrorCode,
      };
    }
    return {
      schemaVersion: N20_SCHEMA_VERSION,
      caseId: parsed.caseId,
      fixtureVersion: parsed.fixtureVersion,
      status: 'passed',
      actual: firstSummary,
      report,
      mismatch: null,
      errorCode: null,
    };
  } catch {
    return rejected(parsed.caseId, parsed.fixtureVersion, 'REPLAY_INTERNAL');
  }
}

export function toReplaySummary(trace: ExecutionTrace): ReplaySummary {
  return {
    schemaVersion: 'n19.v1',
    eventTypes: trace.events.map((event) => event.eventType),
    nodePath: [...trace.path],
    routes: [...trace.routes],
    finalRunStatus: trace.finalRunStatus,
    finalResumeStatus: trace.finalResumeStatus,
    terminalOutcome: trace.terminalOutcome,
    errorCode: trace.errorCode,
    eventCount: trace.events.length,
    lastSequence: trace.events.at(-1)?.sequence ?? 0,
  };
}

interface ReplayRequestCandidate {
  schemaVersion: string;
  caseId: string;
  fixtureVersion: string;
}

export function parseReplayRequest(value: unknown): ReplayRequestCandidate | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value).sort();
  if (keys.length !== REQUEST_KEYS.length || !REQUEST_KEYS.every((key) => keys.includes(key))) return undefined;
  if (typeof value.schemaVersion !== 'string' || typeof value.caseId !== 'string' || typeof value.fixtureVersion !== 'string') return undefined;
  return { schemaVersion: value.schemaVersion, caseId: value.caseId, fixtureVersion: value.fixtureVersion };
}

export function compareSummary(expected: ReplaySummary, actual: ReplaySummary): ReplayMismatch | null {
  const scalarFields: Array<[ReplayMismatchKind, ReplayComparableValue, ReplayComparableValue]> = [
    ['schema_version', expected.schemaVersion, actual.schemaVersion],
    ['run_status', expected.finalRunStatus, actual.finalRunStatus],
    ['resume_status', expected.finalResumeStatus, actual.finalResumeStatus],
    ['terminal_outcome', expected.terminalOutcome, actual.terminalOutcome],
    ['error_code', expected.errorCode, actual.errorCode],
    ['event_count', expected.eventCount, actual.eventCount],
    ['sequence', expected.lastSequence, actual.lastSequence],
  ];
  for (const [kind, expectedValue, actualValue] of scalarFields) {
    if (expectedValue !== actualValue) return { kind, index: null, expected: expectedValue, actual: actualValue };
  }

  const arrays: Array<[ReplayMismatchKind, ReplayComparableValue[], ReplayComparableValue[]]> = [
    ['event_type', expected.eventTypes, actual.eventTypes],
    ['node', expected.nodePath, actual.nodePath],
    ['route', expected.routes, actual.routes],
  ];
  for (const [kind, expectedValues, actualValues] of arrays) {
    const length = Math.max(expectedValues.length, actualValues.length);
    for (let index = 0; index < length; index += 1) {
      if (expectedValues[index] !== actualValues[index]) {
        return { kind, index, expected: expectedValues[index] ?? null, actual: actualValues[index] ?? null };
      }
    }
  }
  return null;
}

async function executeFixture(fixture: ReplayFixtureDefinition, runKey: string): Promise<ExecutionTrace> {
  const context: ReplayFixtureExecutionContext = {
    traceId: `n20-${fixture.caseId}-${runKey}-trace`,
    threadId: `n20-${fixture.caseId}-${runKey}-thread`,
    runN17: async (inputContent: string, ports: WorkflowPorts) =>
      (await runTracedN17Workflow(inputContent, ports, context.traceId, context.threadId)).trace,
    runN18: async (inputContent: string, ports: WorkflowPorts, action: N18ReplayAction) =>
      runN18Replay(inputContent, ports, action, context),
  };
  return fixture.execute(context);
}

async function runN18Replay(
  inputContent: string,
  ports: WorkflowPorts,
  action: N18ReplayAction,
  context: ReplayFixtureExecutionContext,
): Promise<ExecutionTrace> {
  if (!(N18_REPLAY_ACTIONS as readonly string[]).includes(action)) throw new Error('unsupported replay action');
  const session = createTracedHumanReviewSession(ports);
  const initial = await session.start(inputContent, context.threadId, context.traceId);
  if (action === 'pause') return initial.trace;
  if (action === 'stale') return (await session.resume(`${context.threadId}-unknown`, { decision: 'approve_handoff', decisionVersion: 1 })).trace;

  const decision = action === 'approve' || action === 'duplicate'
    ? { decision: 'approve_handoff', decisionVersion: 1 }
    : action === 'deny'
      ? { decision: 'deny_handoff', decisionVersion: 1 }
      : action === 'invalid'
        ? { decision: 'approve_handoff', decisionVersion: 1, extra: 'blocked' }
        : null;
  const resumed = await session.resume(context.threadId, decision);
  if (action === 'duplicate') return (await session.resume(context.threadId, { decision: 'approve_handoff', decisionVersion: 1 })).trace;
  return resumed.trace;
}

function toComparableSummary(summary: ReplaySummary): ReplaySummary {
  return {
    ...summary,
    eventTypes: [...summary.eventTypes],
    nodePath: [...summary.nodePath],
    routes: [...summary.routes],
  };
}

function rejected(caseId: N20CaseId | null, fixtureVersion: typeof N20_FIXTURE_VERSION | null, errorCode: N20ReplayErrorCode): ReplayResult {
  return { schemaVersion: N20_SCHEMA_VERSION, caseId, fixtureVersion, status: 'rejected', actual: null, report: null, mismatch: null, errorCode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
