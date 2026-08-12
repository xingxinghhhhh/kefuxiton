import { Command, MemorySaver } from '@langchain/langgraph';
import type { WorkflowPorts } from './ports.js';
import { isRetrievedKnowledgeResult } from './state.js';
import { createHumanReviewWorkflow } from './hitl-graph.js';
import {
  createHumanReviewConfig,
  mapHitlGraphOutput,
} from './hitl-resume.js';
import {
  isRecord,
  MISSING_RESUME_MARKER,
  type HitlGraphStateFromAnnotation,
  type HitlRunResult,
} from './hitl-state.js';
import {
  type ExecutionTrace,
  type N19ErrorCode,
  type TraceTerminalOutcome,
} from './trace-contract.js';
import { TraceRecorder } from './trace-recorder.js';

export interface TracedHitlRunResult extends HitlRunResult {
  trace: ExecutionTrace;
}

export function createTracedHumanReviewSession(ports: WorkflowPorts) {
  const checkpointer = new MemorySaver();
  const recorders = new Map<string, TraceRecorder>();

  return {
    start: async (inputContent: string, threadId: string, traceId = threadId): Promise<TracedHitlRunResult> => {
      const recorder = new TraceRecorder(traceId, threadId);
      recorders.set(threadId, recorder);
      recorder.recordRunStarted();
      const output = await createHumanReviewWorkflow(makeTracedPorts(ports, recorder), checkpointer, recorder).invoke(
        { inputContent },
        createHumanReviewConfig(threadId),
      );
      return finishGraphRun(output, threadId, recorder);
    },
    resume: async (threadId: string, decision: unknown): Promise<TracedHitlRunResult> => {
      const recorder = recorders.get(threadId) ?? new TraceRecorder(threadId, threadId);
      if (!recorders.has(threadId)) {
        recorder.recordRunStarted();
        recorders.set(threadId, recorder);
      }

      const config = createHumanReviewConfig(threadId);
      const graph = createHumanReviewWorkflow(makeTracedPorts(ports, recorder), checkpointer, recorder);
      const snapshot = await graph.getState(config);
      const currentState = isRecord(snapshot.values) ? snapshot.values : undefined;
      if (!currentState || snapshot.next.length === 0) {
        const duplicate = currentState !== undefined && 'resumeStatus' in currentState;
        const resumeStatus = duplicate ? 'duplicate' : 'stale';
        const errorCode = duplicate ? 'HUMAN_RESUME_DUPLICATE' : 'HUMAN_RESUME_STALE';
        recorder.recordResumeRejected(resumeStatus, errorCode);
        return {
          runStatus: 'rejected',
          threadId,
          result: null,
          resumeStatus: duplicate && isResumeStatus(currentState.resumeStatus) ? currentState.resumeStatus : 'stale',
          errorCode,
          trace: recorder.build(),
        };
      }

      recorder.recordResumed();
      const output = await graph.invoke(
        new Command({ resume: decision === undefined || decision === null ? MISSING_RESUME_MARKER : decision }),
        config,
      );
      return finishGraphRun(output, threadId, recorder);
    },
  };
}

function makeTracedPorts(ports: WorkflowPorts, recorder: TraceRecorder): WorkflowPorts {
  return {
    classifyUserRequest: ports.classifyUserRequest,
    retrievePublished: async (question: string): Promise<unknown> => {
      try {
        const value = await ports.retrievePublished(question);
        if (!isRetrievedKnowledgeResult(value)) recorder.setErrorCode('RETRIEVAL_INVALID');
        return value;
      } catch (error) {
        recorder.setErrorCode('RETRIEVAL_FAILED');
        throw error;
      }
    },
    containsUntrustedInstruction: (chunks) => {
      try {
        return ports.containsUntrustedInstruction(chunks);
      } catch (error) {
        recorder.setErrorCode('FAIL_CLOSED');
        throw error;
      }
    },
  };
}

function finishGraphRun(output: HitlGraphStateFromAnnotation, threadId: string, recorder: TraceRecorder): TracedHitlRunResult {
  const result = mapHitlGraphOutput(output, threadId);
  if (result.runStatus === 'paused') {
    recorder.recordPaused();
  } else {
    recorder.recordTerminal(
      result.runStatus,
      result.resumeStatus,
      terminalOutcomeForResult(output, result, recorder),
      mapErrorCode(result.errorCode) ?? recorder.getErrorCode(),
    );
  }
  return { ...result, trace: recorder.build() };
}

function terminalOutcomeForResult(
  output: HitlGraphStateFromAnnotation,
  result: HitlRunResult,
  recorder: TraceRecorder,
): TraceTerminalOutcome {
  if (recorder.getErrorCode() || result.runStatus === 'rejected' || output.path === 'fail_closed') return 'fail_closed';
  return output.terminalOutcome ?? 'fail_closed';
}

function mapErrorCode(value: unknown): N19ErrorCode | null {
  if (value === 'HUMAN_DECISION_MISSING') return value;
  if (value === 'HUMAN_DECISION_INVALID') return value;
  if (value === 'HUMAN_RESUME_DUPLICATE') return value;
  if (value === 'HUMAN_RESUME_STALE') return value;
  if (value === undefined || value === null) return null;
  return 'FAIL_CLOSED';
}

function isResumeStatus(value: unknown): value is HitlRunResult['resumeStatus'] {
  return value === 'not_started' || value === 'paused' || value === 'approved' || value === 'denied' || value === 'invalid' || value === 'duplicate' || value === 'stale';
}
