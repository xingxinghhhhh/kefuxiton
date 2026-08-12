export const N19_SCHEMA_VERSION = 'n19.v1' as const;

export const TRACE_NODES = [
  'classify_request',
  'retrieve_published',
  'inspect_knowledge',
  'prepare_handoff_pause',
  'request_human_decision',
  'validate_human_decision',
  'safe_refusal',
  'handoff_recommended',
  'safe_unavailable',
  'knowledge_answer',
  'mock_fallback',
  'fail_closed',
] as const;

export type TraceNode = (typeof TRACE_NODES)[number];
export type TracePath = TraceNode[];

export const TRACE_ROUTES = [
  'injection',
  'handoff',
  'inspect_knowledge',
  'no_match',
  'unsafe_knowledge',
  'knowledge_answer',
  'mock_fallback',
  'prepare_handoff_pause',
  'request_human_decision',
  'validate_human_decision',
  'safe_refusal',
  'handoff_recommended',
  'safe_unavailable',
  'fail_closed',
] as const;

export type TraceRoute = (typeof TRACE_ROUTES)[number];

export const N19_ERROR_CODES = [
  'HUMAN_DECISION_MISSING',
  'HUMAN_DECISION_INVALID',
  'HUMAN_RESUME_DUPLICATE',
  'HUMAN_RESUME_STALE',
  'RETRIEVAL_FAILED',
  'RETRIEVAL_INVALID',
  'FAIL_CLOSED',
  'TRACE_NODE_UNKNOWN',
  'TRACE_ROUTE_UNKNOWN',
  'TRACE_INVARIANT_FAILED',
  'SENSITIVE_DATA_REJECTED',
] as const;

export type N19ErrorCode = (typeof N19_ERROR_CODES)[number];

export const TRACE_EVENT_TYPES = [
  'run_started',
  'node_entered',
  'node_completed',
  'paused',
  'resumed',
  'resume_rejected',
  'terminal',
] as const;

export type TraceEventType = (typeof TRACE_EVENT_TYPES)[number];
export type TracePhase = 'initial' | 'resume';
export type TraceRunStatus = 'running' | 'paused' | 'completed' | 'rejected';
export type TraceFinalRunStatus = Exclude<TraceRunStatus, 'running'>;
export type TraceResumeStatus = 'not_started' | 'paused' | 'approved' | 'denied' | 'invalid' | 'duplicate' | 'stale';
export type TraceTerminalOutcome =
  | 'knowledge_answer'
  | 'safe_unavailable'
  | 'handoff_recommended'
  | 'mock_fallback'
  | 'safe_refusal'
  | 'fail_closed';

export interface TraceEvent {
  schemaVersion: typeof N19_SCHEMA_VERSION;
  sequence: number;
  eventType: TraceEventType;
  phase: TracePhase;
  node: TraceNode | null;
  route: TraceRoute | null;
  runStatus: TraceRunStatus;
  resumeStatus: TraceResumeStatus;
  terminalOutcome: TraceTerminalOutcome | null;
  errorCode: N19ErrorCode | null;
}

export interface AuditSummary {
  schemaVersion: typeof N19_SCHEMA_VERSION;
  eventCount: number;
  lastSequence: number;
  finalRunStatus: TraceFinalRunStatus;
  lastResumeStatus: TraceResumeStatus;
  terminalOutcome: TraceTerminalOutcome | null;
  errorCode: N19ErrorCode | null;
  path: TracePath;
  pauseCount: number;
  resumeCount: number;
  rejectedResumeCount: number;
}

export interface ExecutionTrace {
  schemaVersion: typeof N19_SCHEMA_VERSION;
  traceId: string;
  threadId: string;
  events: TraceEvent[];
  path: TracePath;
  routes: TraceRoute[];
  finalRunStatus: TraceFinalRunStatus;
  finalResumeStatus: TraceResumeStatus;
  terminalOutcome: TraceTerminalOutcome | null;
  errorCode: N19ErrorCode | null;
  auditSummary: AuditSummary;
}

export interface TraceSink {
  setPhase(phase: TracePhase): void;
  setErrorCode(errorCode: N19ErrorCode): void;
  recordNodeEntered(node: TraceNode): void;
  recordNodeCompleted(node: TraceNode, route: TraceRoute | null): void;
}

export function isTraceNode(value: unknown): value is TraceNode {
  return typeof value === 'string' && (TRACE_NODES as readonly string[]).includes(value);
}

export function isTraceRoute(value: unknown): value is TraceRoute {
  return typeof value === 'string' && (TRACE_ROUTES as readonly string[]).includes(value);
}

export function isN19ErrorCode(value: unknown): value is N19ErrorCode {
  return typeof value === 'string' && (N19_ERROR_CODES as readonly string[]).includes(value);
}

export function toTraceNode(value: string): TraceNode | undefined {
  return isTraceNode(value) ? value : undefined;
}

export function toTraceRoute(value: unknown): TraceRoute | undefined {
  return isTraceRoute(value) ? value : undefined;
}
