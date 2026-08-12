import {
  N20_CASE_IDS,
  N20_FIXTURE_VERSION,
  N20_REPLAY_ERROR_CODES,
  N20_SCHEMA_VERSION,
  REPLAY_MISMATCH_KINDS,
  isN20CaseId,
  type N20CaseId,
  type N20ReplayErrorCode,
  type ReplayResult,
  type ReplaySummary,
} from './replay-contract.js';
import {
  N21_FIXTURE_VERSION,
  N21_MAX_PATH_ITEMS,
  N21_MAX_REPORT_BYTES,
  N21_MAX_SEQUENCE_VALUE,
  N21_SCHEMA_VERSION,
  type N21CompareBasis,
  type N21DiagnosticKind,
  type N21DiagnosticStatus,
  type N21ReasonCode,
  type ReplayDiagnosticReport,
  type SafeDeterminismReport,
  type SafeMismatch,
  type SafeReplaySummary,
} from './replay-diagnostic-contract.js';
import {
  N19_ERROR_CODES,
  N19_SCHEMA_VERSION,
  TRACE_EVENT_TYPES,
  TRACE_NODES,
  TRACE_ROUTES,
  type N19ErrorCode,
  type TraceEventType,
  type TraceFinalRunStatus,
  type TraceNode,
  type TraceResumeStatus,
  type TraceRoute,
  type TraceTerminalOutcome,
} from './trace-contract.js';

const REPORT_KEYS = [
  'schemaVersion',
  'caseId',
  'fixtureVersion',
  'diagnosticStatus',
  'diagnosticKind',
  'reasonCode',
  'sourceErrorCode',
  'compareBasis',
  'determinism',
  'actualSummary',
  'firstMismatch',
] as const;
const SUMMARY_KEYS = [
  'schemaVersion',
  'eventTypes',
  'nodePath',
  'routes',
  'finalRunStatus',
  'finalResumeStatus',
  'terminalOutcome',
  'errorCode',
  'eventCount',
  'lastSequence',
] as const;
const DETERMINISM_KEYS = [
  'schemaVersion',
  'caseId',
  'fixtureVersion',
  'runsCompared',
  'matchesGolden',
  'matchesSecondRun',
  'deterministic',
  'firstMismatchIndex',
] as const;
const MISMATCH_KEYS = ['kind', 'index', 'expected', 'actual'] as const;

const FINAL_RUN_STATUSES = ['paused', 'completed', 'rejected'] as const;
const RESUME_STATUSES = ['not_started', 'paused', 'approved', 'denied', 'invalid', 'duplicate', 'stale'] as const;
const TERMINAL_OUTCOMES = ['knowledge_answer', 'safe_unavailable', 'handoff_recommended', 'mock_fallback', 'safe_refusal', 'fail_closed'] as const;

export function diagnoseReplayResult(result: ReplayResult): ReplayDiagnosticReport {
  const validation = validateReplayResult(result);
  if (!validation.valid) return sensitiveRejectedReport();

  const sourceErrorCode = result.errorCode;
  const caseId = isN20CaseId(result.caseId) ? result.caseId : null;
  const fixtureVersion = result.fixtureVersion === N20_FIXTURE_VERSION ? N21_FIXTURE_VERSION : null;

  if (result.status === 'passed') {
    return finalizeReport({
      schemaVersion: N21_SCHEMA_VERSION,
      caseId,
      fixtureVersion,
      diagnosticStatus: 'passed',
      diagnosticKind: 'none',
      reasonCode: 'NONE',
      sourceErrorCode: null,
      compareBasis: 'none',
      determinism: copyDeterminism(result.report),
      actualSummary: copySummary(result.actual),
      firstMismatch: null,
    });
  }

  if (result.status === 'mismatch') {
    const isNonDeterministic = sourceErrorCode === 'REPLAY_NON_DETERMINISTIC';
    return finalizeReport({
      schemaVersion: N21_SCHEMA_VERSION,
      caseId,
      fixtureVersion,
      diagnosticStatus: 'mismatch',
      diagnosticKind: isNonDeterministic ? 'non_deterministic' : 'golden_mismatch',
      reasonCode: isNonDeterministic ? 'REPLAY_NON_DETERMINISTIC' : 'GOLDEN_MISMATCH',
      sourceErrorCode,
      compareBasis: isNonDeterministic ? 'second_run' : 'golden',
      determinism: copyDeterminism(result.report),
      actualSummary: copySummary(result.actual),
      firstMismatch: copyMismatch(result.mismatch),
    });
  }

  if (sourceErrorCode === 'REPLAY_INTERNAL') {
    return finalizeReport({
      schemaVersion: N21_SCHEMA_VERSION,
      caseId,
      fixtureVersion,
      diagnosticStatus: 'internal_failure',
      diagnosticKind: 'internal_failure',
      reasonCode: 'REPLAY_INTERNAL',
      sourceErrorCode,
      compareBasis: 'none',
      determinism: null,
      actualSummary: null,
      firstMismatch: null,
    });
  }

  if (sourceErrorCode === 'REPLAY_REQUEST_INVALID') {
    return finalizeReport({
      schemaVersion: N21_SCHEMA_VERSION,
      caseId,
      fixtureVersion,
      diagnosticStatus: 'rejected',
      diagnosticKind: 'request_rejected',
      reasonCode: 'REPLAY_REQUEST_INVALID',
      sourceErrorCode,
      compareBasis: 'none',
      determinism: null,
      actualSummary: null,
      firstMismatch: null,
    });
  }

  return finalizeReport({
    schemaVersion: N21_SCHEMA_VERSION,
    caseId,
    fixtureVersion,
    diagnosticStatus: 'rejected',
    diagnosticKind: 'fixture_rejected',
    reasonCode: 'FIXTURE_REJECTED',
    sourceErrorCode,
    compareBasis: 'none',
    determinism: null,
    actualSummary: null,
    firstMismatch: null,
  });
}

function finalizeReport(report: ReplayDiagnosticReport): ReplayDiagnosticReport {
  const serialized = JSON.stringify(report);
  if (new TextEncoder().encode(serialized).byteLength > N21_MAX_REPORT_BYTES) return sensitiveRejectedReport();
  return report;
}

function sensitiveRejectedReport(): ReplayDiagnosticReport {
  return {
    schemaVersion: N21_SCHEMA_VERSION,
    caseId: null,
    fixtureVersion: null,
    diagnosticStatus: 'rejected',
    diagnosticKind: 'sensitive_output_rejected',
    reasonCode: 'SENSITIVE_DATA_REJECTED',
    sourceErrorCode: 'SENSITIVE_DATA_REJECTED',
    compareBasis: 'none',
    determinism: null,
    actualSummary: null,
    firstMismatch: null,
  };
}

function validateReplayResult(result: ReplayResult): { valid: true } | { valid: false } {
  if (!isRecord(result) || !hasExactKeys(result, ['schemaVersion', 'caseId', 'fixtureVersion', 'status', 'actual', 'report', 'mismatch', 'errorCode'])) return { valid: false };
  if (result.schemaVersion !== N20_SCHEMA_VERSION || !isN20CaseIdOrNull(result.caseId) || !isFixtureVersionOrNull(result.fixtureVersion)) return { valid: false };
  if (!isReplayStatus(result.status) || !isN20ErrorCodeOrNull(result.errorCode)) return { valid: false };

  if (result.status === 'passed' || result.status === 'mismatch') {
    if (!isReplaySummary(result.actual) || !isDeterminismReport(result.report)) return { valid: false };
    if (result.status === 'passed') {
      if (result.errorCode !== null || result.mismatch !== null) return { valid: false };
    } else if (!isReplayMismatch(result.mismatch) || (result.errorCode !== 'TRACE_MISMATCH' && result.errorCode !== 'REPLAY_NON_DETERMINISTIC')) {
      return { valid: false };
    }
    return { valid: true };
  }

  if (result.actual !== null || result.report !== null || result.mismatch !== null) return { valid: false };
  if (result.errorCode === null) return { valid: false };
  return { valid: true };
}

function isReplaySummary(value: unknown): value is ReplaySummary {
  if (!isRecord(value) || !hasExactKeys(value, SUMMARY_KEYS)) return false;
  return value.schemaVersion === N19_SCHEMA_VERSION
    && isEnum(value.eventTypes, TRACE_EVENT_TYPES)
    && isEnum(value.nodePath, TRACE_NODES)
    && isEnum(value.routes, TRACE_ROUTES)
    && value.eventTypes.length <= N21_MAX_PATH_ITEMS
    && value.nodePath.length <= N21_MAX_PATH_ITEMS
    && value.routes.length <= N21_MAX_PATH_ITEMS
    && isEnumValue(value.finalRunStatus, FINAL_RUN_STATUSES)
    && isEnumValue(value.finalResumeStatus, RESUME_STATUSES)
    && isEnumValueOrNull(value.terminalOutcome, TERMINAL_OUTCOMES)
    && isN19ErrorCodeOrNull(value.errorCode)
    && isSafeSequence(value.eventCount)
    && isSafeSequence(value.lastSequence);
}

function isDeterminismReport(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, DETERMINISM_KEYS)) return false;
  return value.schemaVersion === N20_SCHEMA_VERSION
    && isN20CaseId(value.caseId)
    && value.fixtureVersion === N20_FIXTURE_VERSION
    && value.runsCompared === 2
    && typeof value.matchesGolden === 'boolean'
    && typeof value.matchesSecondRun === 'boolean'
    && typeof value.deterministic === 'boolean'
    && isSafeIndexOrNull(value.firstMismatchIndex);
}

function isReplayMismatch(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, MISMATCH_KEYS)) return false;
  return isEnumValue(value.kind, REPLAY_MISMATCH_KINDS)
    && isSafeIndexOrNull(value.index)
    && isSafeComparableValue(value.expected)
    && isSafeComparableValue(value.actual);
}

function copySummary(value: ReplaySummary | null): SafeReplaySummary | null {
  if (!value) return null;
  return {
    schemaVersion: value.schemaVersion,
    eventTypes: [...value.eventTypes],
    nodePath: [...value.nodePath],
    routes: [...value.routes],
    finalRunStatus: value.finalRunStatus,
    finalResumeStatus: value.finalResumeStatus,
    terminalOutcome: value.terminalOutcome,
    errorCode: value.errorCode,
    eventCount: value.eventCount,
    lastSequence: value.lastSequence,
  };
}

function copyDeterminism(value: { runsCompared: 2; matchesGolden: boolean; matchesSecondRun: boolean; deterministic: boolean; firstMismatchIndex: number | null } | null): SafeDeterminismReport | null {
  if (!value) return null;
  return {
    runsCompared: 2,
    matchesGolden: value.matchesGolden,
    matchesSecondRun: value.matchesSecondRun,
    deterministic: value.deterministic,
    firstMismatchIndex: value.firstMismatchIndex,
  };
}

function copyMismatch(value: { kind: SafeMismatch['kind']; index: number | null; expected: SafeMismatch['expected']; actual: SafeMismatch['actual'] } | null): SafeMismatch | null {
  if (!value) return null;
  return { kind: value.kind, index: value.index, expected: value.expected, actual: value.actual };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => actualKeys.includes(key));
}

function isReplayStatus(value: unknown): value is ReplayResult['status'] {
  return value === 'passed' || value === 'mismatch' || value === 'rejected';
}

function isN20CaseIdOrNull(value: unknown): value is N20CaseId | null {
  return value === null || (typeof value === 'string' && (N20_CASE_IDS as readonly string[]).includes(value));
}

function isFixtureVersionOrNull(value: unknown): value is typeof N20_FIXTURE_VERSION | null {
  return value === null || value === N20_FIXTURE_VERSION;
}

function isN20ErrorCodeOrNull(value: unknown): value is N20ReplayErrorCode | null {
  return value === null || (typeof value === 'string' && (N20_REPLAY_ERROR_CODES as readonly string[]).includes(value));
}

function isN19ErrorCodeOrNull(value: unknown): value is N19ErrorCode | null {
  return value === null || (typeof value === 'string' && (N19_ERROR_CODES as readonly string[]).includes(value));
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T[] {
  return Array.isArray(value) && value.every((item) => isEnumValue(item, values));
}

function isEnumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isEnumValueOrNull<T extends string>(value: unknown, values: readonly T[]): value is T | null {
  return value === null || isEnumValue(value, values);
}

function isSafeSequence(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= N21_MAX_SEQUENCE_VALUE;
}

function isSafeIndexOrNull(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= N21_MAX_SEQUENCE_VALUE);
}

function isSafeComparableValue(value: unknown): boolean {
  if (value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= N21_MAX_SEQUENCE_VALUE)) return true;
  return typeof value === 'string'
    && ([
      ...TRACE_EVENT_TYPES,
      ...TRACE_NODES,
      ...TRACE_ROUTES,
      ...FINAL_RUN_STATUSES,
      ...RESUME_STATUSES,
      ...TERMINAL_OUTCOMES,
      ...N19_ERROR_CODES,
      ...N20_REPLAY_ERROR_CODES,
    ] as readonly string[]).includes(value);
}
