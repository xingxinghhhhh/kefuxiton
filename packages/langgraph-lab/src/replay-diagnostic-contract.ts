import type {
  N19ErrorCode,
  TraceEventType,
  TraceFinalRunStatus,
  TraceNode,
  TraceResumeStatus,
  TraceRoute,
  TraceTerminalOutcome,
} from './trace-contract.js';
import type {
  N20CaseId,
  N20ReplayErrorCode,
  ReplayComparableValue,
  ReplayMismatchKind,
} from './replay-contract.js';

export const N21_SCHEMA_VERSION = 'n21.v1' as const;
export const N21_FIXTURE_VERSION = 'n20.v1' as const;
export const N21_MAX_SEQUENCE_VALUE = 128 as const;
export const N21_MAX_PATH_ITEMS = 32 as const;
export const N21_MAX_REPORT_BYTES = 16 * 1024;

export const N21_DIAGNOSTIC_STATUSES = ['passed', 'mismatch', 'rejected', 'internal_failure'] as const;
export type N21DiagnosticStatus = (typeof N21_DIAGNOSTIC_STATUSES)[number];

export const N21_DIAGNOSTIC_KINDS = [
  'none',
  'golden_mismatch',
  'non_deterministic',
  'request_rejected',
  'fixture_rejected',
  'sensitive_output_rejected',
  'internal_failure',
] as const;
export type N21DiagnosticKind = (typeof N21_DIAGNOSTIC_KINDS)[number];

export const N21_REASON_CODES = [
  'NONE',
  'GOLDEN_MISMATCH',
  'REPLAY_NON_DETERMINISTIC',
  'REPLAY_REQUEST_INVALID',
  'FIXTURE_REJECTED',
  'SENSITIVE_DATA_REJECTED',
  'REPLAY_INTERNAL',
] as const;
export type N21ReasonCode = (typeof N21_REASON_CODES)[number];

export const N21_COMPARE_BASES = ['none', 'golden', 'second_run'] as const;
export type N21CompareBasis = (typeof N21_COMPARE_BASES)[number];

export interface SafeReplaySummary {
  schemaVersion: 'n19.v1';
  eventTypes: TraceEventType[];
  nodePath: TraceNode[];
  routes: TraceRoute[];
  finalRunStatus: TraceFinalRunStatus;
  finalResumeStatus: TraceResumeStatus;
  terminalOutcome: TraceTerminalOutcome | null;
  errorCode: N19ErrorCode | null;
  eventCount: number;
  lastSequence: number;
}

export interface SafeDeterminismReport {
  runsCompared: 2;
  matchesGolden: boolean;
  matchesSecondRun: boolean;
  deterministic: boolean;
  firstMismatchIndex: number | null;
}

export type N21SafeComparableValue = ReplayComparableValue;

export interface SafeMismatch {
  kind: ReplayMismatchKind;
  index: number | null;
  expected: N21SafeComparableValue;
  actual: N21SafeComparableValue;
}

export interface ReplayDiagnosticReport {
  schemaVersion: typeof N21_SCHEMA_VERSION;
  caseId: N20CaseId | null;
  fixtureVersion: typeof N21_FIXTURE_VERSION | null;
  diagnosticStatus: N21DiagnosticStatus;
  diagnosticKind: N21DiagnosticKind;
  reasonCode: N21ReasonCode;
  sourceErrorCode: N20ReplayErrorCode | null;
  compareBasis: N21CompareBasis;
  determinism: SafeDeterminismReport | null;
  actualSummary: SafeReplaySummary | null;
  firstMismatch: SafeMismatch | null;
}

export function isN21DiagnosticStatus(value: unknown): value is N21DiagnosticStatus {
  return typeof value === 'string' && (N21_DIAGNOSTIC_STATUSES as readonly string[]).includes(value);
}

export function isN21DiagnosticKind(value: unknown): value is N21DiagnosticKind {
  return typeof value === 'string' && (N21_DIAGNOSTIC_KINDS as readonly string[]).includes(value);
}

export function isN21ReasonCode(value: unknown): value is N21ReasonCode {
  return typeof value === 'string' && (N21_REASON_CODES as readonly string[]).includes(value);
}

export function isN21CompareBasis(value: unknown): value is N21CompareBasis {
  return typeof value === 'string' && (N21_COMPARE_BASES as readonly string[]).includes(value);
}
