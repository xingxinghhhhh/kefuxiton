import { Command, MemorySaver } from '@langchain/langgraph';
import type { WorkflowPorts } from './ports.js';
import { createHumanReviewWorkflow } from './hitl-graph.js';
import {
  isHandoffInterruptPayload,
  isRecord,
  MISSING_RESUME_MARKER,
  type HandoffInterruptPayload,
  type HitlGraphStateFromAnnotation,
  type HitlRunResult,
} from './hitl-state.js';
import type { AgentResultCompat } from './state.js';

export function createHumanReviewSession(ports: WorkflowPorts) {
  const graph = createHumanReviewWorkflow(ports, new MemorySaver());

  return {
    graph,
    start: async (inputContent: string, threadId: string): Promise<HitlRunResult> => {
      const output = await graph.invoke({ inputContent }, createHumanReviewConfig(threadId));
      return mapHitlGraphOutput(output, threadId);
    },
    resume: async (threadId: string, decision: unknown): Promise<HitlRunResult> => {
      const config = createHumanReviewConfig(threadId);
      const snapshot = await graph.getState(config);
      const currentState = isRecord(snapshot.values) ? snapshot.values : undefined;
      if (!currentState || snapshot.next.length === 0) {
        return {
          runStatus: currentState && 'resumeStatus' in currentState ? 'rejected' : 'rejected',
          threadId,
          result: null,
          resumeStatus: currentState && isResumeStatus(currentState.resumeStatus) ? currentState.resumeStatus : 'stale',
          errorCode: currentState && currentState.resumeStatus !== undefined ? 'HUMAN_RESUME_DUPLICATE' : 'HUMAN_RESUME_STALE',
        };
      }

      const output = await graph.invoke(new Command({ resume: decision === undefined || decision === null ? MISSING_RESUME_MARKER : decision }), config);
      return mapHitlGraphOutput(output, threadId);
    },
  };
}

export function createHumanReviewConfig(threadId: string) {
  return { configurable: { thread_id: threadId } };
}

export function mapHitlGraphOutput(output: HitlGraphStateFromAnnotation, threadId: string): HitlRunResult {
  const interruptPayload = extractInterruptPayload(output);
  if (interruptPayload) {
    return {
      runStatus: 'paused',
      threadId,
      interruptPayload,
      result: null,
      resumeStatus: 'paused',
      path: output.path,
    };
  }

  return {
    runStatus: output.resumeStatus === 'invalid' ? 'rejected' : 'completed',
    threadId,
    result: output.result ?? null,
    resumeStatus: output.resumeStatus ?? 'not_started',
    terminalOutcome: output.terminalOutcome,
    errorCode: output.errorCode ?? (output.result ? undefined : 'HITL_RESULT_MISSING'),
    path: output.path,
  };
}

function extractInterruptPayload(output: HitlGraphStateFromAnnotation): HandoffInterruptPayload | undefined {
  if (!('__interrupt__' in output) || !Array.isArray(output.__interrupt__)) return undefined;
  const firstInterrupt: unknown = output.__interrupt__[0];
  if (!isRecord(firstInterrupt) || !isHandoffInterruptPayload(firstInterrupt.value)) return undefined;
  return firstInterrupt.value;
}

function isResumeStatus(value: unknown): value is HitlRunResult['resumeStatus'] {
  return value === 'not_started' || value === 'paused' || value === 'approved' || value === 'denied' || value === 'invalid' || value === 'duplicate' || value === 'stale';
}

export function isAgentResult(value: unknown): value is AgentResultCompat {
  if (!isRecord(value)) return false;
  return typeof value.content === 'string' && Array.isArray(value.citations) && typeof value.handoffRecommended === 'boolean';
}
