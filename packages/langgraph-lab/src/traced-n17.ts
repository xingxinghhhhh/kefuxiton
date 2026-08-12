import { createLangGraphWorkflow } from './graph.js';
import type { WorkflowPorts } from './ports.js';
import { isRetrievedKnowledgeResult, type GraphState } from './state.js';
import {
  type ExecutionTrace,
  type N19ErrorCode,
  type TraceTerminalOutcome,
  toTraceRoute,
} from './trace-contract.js';
import { TraceRecorder } from './trace-recorder.js';

export interface TracedN17Result {
  state: GraphState;
  trace: ExecutionTrace;
}

export async function runTracedN17Workflow(
  inputContent: string,
  ports: WorkflowPorts,
  traceId: string,
  threadId = traceId,
): Promise<TracedN17Result> {
  const recorder = new TraceRecorder(traceId, threadId);
  let portError: N19ErrorCode | null = null;
  const tracedPorts: WorkflowPorts = {
    classifyUserRequest: ports.classifyUserRequest,
    retrievePublished: async (question: string): Promise<unknown> => {
      try {
        const value = await ports.retrievePublished(question);
        if (!isRetrievedKnowledgeResult(value)) portError = 'RETRIEVAL_INVALID';
        if (portError) recorder.setErrorCode(portError);
        return value;
      } catch (error) {
        portError = 'RETRIEVAL_FAILED';
        recorder.setErrorCode(portError);
        throw error;
      }
    },
    containsUntrustedInstruction: (chunks) => {
      try {
        return ports.containsUntrustedInstruction(chunks);
      } catch (error) {
        portError = 'FAIL_CLOSED';
        recorder.setErrorCode(portError);
        throw error;
      }
    },
  };

  recorder.recordRunStarted();
  const state = await createLangGraphWorkflow(tracedPorts, recorder).invoke({ inputContent });
  const terminalOutcome = portError ? 'fail_closed' : terminalOutcomeForPath(state.path);
  recorder.recordTerminal('completed', 'not_started', terminalOutcome, recorder.getErrorCode());

  return { state, trace: recorder.build() };
}

function terminalOutcomeForPath(path: GraphState['path']): TraceTerminalOutcome {
  if (path === 'injection') return 'safe_refusal';
  if (path === 'handoff' || path === 'unsafe_knowledge') return 'handoff_recommended';
  if (path === 'no_match') return 'safe_unavailable';
  if (path === 'knowledge_answer') return 'knowledge_answer';
  if (path === 'mock_fallback') return 'mock_fallback';
  if (toTraceRoute(path)) return 'fail_closed';
  return 'fail_closed';
}
