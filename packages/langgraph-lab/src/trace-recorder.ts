import {
  N19_SCHEMA_VERSION,
  type AuditSummary,
  type ExecutionTrace,
  type N19ErrorCode,
  type TraceEvent,
  type TraceEventType,
  type TraceFinalRunStatus,
  type TracePhase,
  type TraceResumeStatus,
  type TraceRoute,
  type TraceRunStatus,
  type TraceSink,
  type TraceTerminalOutcome,
  type TraceNode,
} from './trace-contract.js';

interface TraceEventOverrides {
  eventType: TraceEventType;
  node?: TraceNode | null;
  route?: TraceRoute | null;
  runStatus: TraceRunStatus;
  resumeStatus: TraceResumeStatus;
  terminalOutcome?: TraceTerminalOutcome | null;
  errorCode?: N19ErrorCode | null;
}

const SYNTHETIC_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export class TraceRecorder implements TraceSink {
  private readonly events: TraceEvent[] = [];
  private readonly nodeEventKeys = new Set<string>();
  private phase: TracePhase = 'initial';
  private runStatus: TraceRunStatus = 'running';
  private resumeStatus: TraceResumeStatus = 'not_started';
  private terminalOutcome: TraceTerminalOutcome | null = null;
  private errorCode: N19ErrorCode | null = null;

  public constructor(
    public readonly traceId: string,
    public readonly threadId: string,
  ) {
    assertSyntheticId(traceId, 'traceId');
    assertSyntheticId(threadId, 'threadId');
  }

  public setPhase(phase: TracePhase): void {
    this.phase = phase;
  }

  public recordRunStarted(): void {
    this.runStatus = 'running';
    this.resumeStatus = 'not_started';
    this.append({ eventType: 'run_started', runStatus: 'running', resumeStatus: 'not_started' });
  }

  public recordNodeEntered(node: TraceNode): void {
    const key = `${this.phase}:node_entered:${node}`;
    if (this.nodeEventKeys.has(key)) return;
    this.nodeEventKeys.add(key);
    this.append({ eventType: 'node_entered', node, runStatus: this.runStatus, resumeStatus: this.resumeStatus });
  }

  public recordNodeCompleted(node: TraceNode, route: TraceRoute | null): void {
    const key = `${this.phase}:node_completed:${node}`;
    if (this.nodeEventKeys.has(key)) return;
    this.nodeEventKeys.add(key);
    this.append({ eventType: 'node_completed', node, route, runStatus: this.runStatus, resumeStatus: this.resumeStatus });
  }

  public recordPaused(): void {
    this.runStatus = 'paused';
    this.resumeStatus = 'paused';
    this.append({ eventType: 'paused', runStatus: 'paused', resumeStatus: 'paused' });
  }

  public recordResumed(): void {
    this.phase = 'resume';
    this.runStatus = 'running';
    this.append({ eventType: 'resumed', runStatus: 'running', resumeStatus: 'paused' });
  }

  public recordResumeRejected(resumeStatus: Extract<TraceResumeStatus, 'duplicate' | 'stale'>, errorCode: N19ErrorCode): void {
    this.runStatus = 'rejected';
    this.resumeStatus = resumeStatus;
    this.errorCode = errorCode;
    this.append({ eventType: 'resume_rejected', runStatus: 'rejected', resumeStatus, errorCode });
  }

  public recordTerminal(
    runStatus: TraceFinalRunStatus,
    resumeStatus: TraceResumeStatus,
    terminalOutcome: TraceTerminalOutcome | null,
    errorCode: N19ErrorCode | null = this.errorCode,
  ): void {
    this.runStatus = runStatus;
    this.resumeStatus = resumeStatus;
    this.terminalOutcome = terminalOutcome;
    this.errorCode = errorCode;
    this.append({ eventType: 'terminal', runStatus, resumeStatus, terminalOutcome, errorCode });
  }

  public setErrorCode(errorCode: N19ErrorCode): void {
    this.errorCode = errorCode;
  }

  public getErrorCode(): N19ErrorCode | null {
    return this.errorCode;
  }

  public build(): ExecutionTrace {
    const events = this.events.map((event) => ({ ...event }));
    const path = events.flatMap((event) => event.eventType === 'node_entered' && event.node !== null ? [event.node] : []);
    const routes = events.flatMap((event) => event.route === null ? [] : [event.route]);
    const lastEvent = events.at(-1);
    const finalRunStatus = lastEvent && lastEvent.runStatus !== 'running' ? lastEvent.runStatus : this.runStatus === 'running' ? 'rejected' : this.runStatus;
    const finalResumeStatus = lastEvent?.resumeStatus ?? this.resumeStatus;
    const terminalOutcome = lastEvent?.eventType === 'terminal' ? lastEvent.terminalOutcome : this.terminalOutcome;
    const errorCode = lastEvent?.errorCode ?? this.errorCode;
    const auditSummary: AuditSummary = {
      schemaVersion: N19_SCHEMA_VERSION,
      eventCount: events.length,
      lastSequence: events.length,
      finalRunStatus,
      lastResumeStatus: finalResumeStatus,
      terminalOutcome,
      errorCode,
      path,
      pauseCount: events.filter((event) => event.eventType === 'paused').length,
      resumeCount: events.filter((event) => event.eventType === 'resumed').length,
      rejectedResumeCount: events.filter((event) => event.eventType === 'resume_rejected').length,
    };

    return {
      schemaVersion: N19_SCHEMA_VERSION,
      traceId: this.traceId,
      threadId: this.threadId,
      events,
      path,
      routes,
      finalRunStatus,
      finalResumeStatus,
      terminalOutcome,
      errorCode,
      auditSummary,
    };
  }

  private append(overrides: TraceEventOverrides): void {
    const event: TraceEvent = {
      schemaVersion: N19_SCHEMA_VERSION,
      sequence: this.events.length + 1,
      eventType: overrides.eventType,
      phase: this.phase,
      node: overrides.node ?? null,
      route: overrides.route ?? null,
      runStatus: overrides.runStatus,
      resumeStatus: overrides.resumeStatus,
      terminalOutcome: overrides.terminalOutcome ?? null,
      errorCode: overrides.errorCode ?? this.errorCode,
    };
    this.events.push(event);
  }
}

export function assertSyntheticId(value: string, fieldName: 'traceId' | 'threadId'): void {
  if (!SYNTHETIC_ID_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a non-sensitive synthetic identifier`);
  }
}
