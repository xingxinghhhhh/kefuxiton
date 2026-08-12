import type { WorkflowPorts } from './ports.js';
import type {
  ExecutionTrace,
  N19ErrorCode,
  TraceEventType,
  TraceFinalRunStatus,
  TraceNode,
  TraceResumeStatus,
  TraceRoute,
  TraceTerminalOutcome,
} from './trace-contract.js';
import { N19_SCHEMA_VERSION } from './trace-contract.js';

export const N20_SCHEMA_VERSION = 'n20.v1' as const;
export const N20_FIXTURE_VERSION = 'n20.v1' as const;

export const N20_CASE_IDS = [
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
] as const;

export type N20CaseId = (typeof N20_CASE_IDS)[number];

export const N20_REPLAY_ERROR_CODES = [
  'REPLAY_REQUEST_INVALID',
  'FIXTURE_UNKNOWN',
  'FIXTURE_VERSION_UNSUPPORTED',
  'FIXTURE_HASH_MISMATCH',
  'TRACE_MISMATCH',
  'REPLAY_NON_DETERMINISTIC',
  'SENSITIVE_DATA_REJECTED',
  'REPLAY_INTERNAL',
] as const;

export type N20ReplayErrorCode = (typeof N20_REPLAY_ERROR_CODES)[number];

export const N18_REPLAY_ACTIONS = ['pause', 'approve', 'deny', 'missing', 'invalid', 'duplicate', 'stale'] as const;
export type N18ReplayAction = (typeof N18_REPLAY_ACTIONS)[number];

export interface ReplayRequest {
  schemaVersion: typeof N20_SCHEMA_VERSION;
  caseId: N20CaseId;
  fixtureVersion: typeof N20_FIXTURE_VERSION;
}

export interface ReplaySummary {
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

export const REPLAY_MISMATCH_KINDS = [
  'event_type',
  'phase',
  'node',
  'route',
  'run_status',
  'resume_status',
  'terminal_outcome',
  'error_code',
  'sequence',
  'event_count',
  'schema_version',
  'fixture_version',
] as const;

export type ReplayMismatchKind = (typeof REPLAY_MISMATCH_KINDS)[number];
export type ReplayComparableValue =
  | typeof N19_SCHEMA_VERSION
  | typeof N20_SCHEMA_VERSION
  | TraceEventType
  | TraceNode
  | TraceRoute
  | TraceFinalRunStatus
  | TraceResumeStatus
  | TraceTerminalOutcome
  | N19ErrorCode
  | N20ReplayErrorCode
  | number
  | null;

export interface ReplayMismatch {
  kind: ReplayMismatchKind;
  index: number | null;
  expected: ReplayComparableValue;
  actual: ReplayComparableValue;
}

export interface DeterminismReport {
  schemaVersion: typeof N20_SCHEMA_VERSION;
  caseId: N20CaseId;
  fixtureVersion: typeof N20_FIXTURE_VERSION;
  runsCompared: 2;
  matchesGolden: boolean;
  matchesSecondRun: boolean;
  deterministic: boolean;
  firstMismatchIndex: number | null;
}

export interface ReplayResult {
  schemaVersion: typeof N20_SCHEMA_VERSION;
  caseId: N20CaseId | null;
  fixtureVersion: typeof N20_FIXTURE_VERSION | null;
  status: 'passed' | 'mismatch' | 'rejected';
  actual: ReplaySummary | null;
  report: DeterminismReport | null;
  mismatch: ReplayMismatch | null;
  errorCode: N20ReplayErrorCode | null;
}

export interface ReplayFixtureExecutionContext {
  readonly traceId: string;
  readonly threadId: string;
  runN17(inputContent: string, ports: WorkflowPorts): Promise<ExecutionTrace>;
  runN18(inputContent: string, ports: WorkflowPorts, action: N18ReplayAction): Promise<ExecutionTrace>;
}

export interface ReplayFixtureDefinition {
  caseId: N20CaseId;
  fixtureVersion: typeof N20_FIXTURE_VERSION;
  descriptorHash: string;
  expectedSummary: ReplaySummary;
  execute(context: ReplayFixtureExecutionContext): Promise<ExecutionTrace>;
}

export interface ReplayFixtureRegistry {
  get(caseId: N20CaseId): ReplayFixtureDefinition | undefined;
  expectedDescriptorHash(caseId: N20CaseId): string | undefined;
}

export function isN20CaseId(value: unknown): value is N20CaseId {
  return typeof value === 'string' && (N20_CASE_IDS as readonly string[]).includes(value);
}

export function isN18ReplayAction(value: unknown): value is N18ReplayAction {
  return typeof value === 'string' && (N18_REPLAY_ACTIONS as readonly string[]).includes(value);
}

export function isN20ReplayErrorCode(value: unknown): value is N20ReplayErrorCode {
  return typeof value === 'string' && (N20_REPLAY_ERROR_CODES as readonly string[]).includes(value);
}
