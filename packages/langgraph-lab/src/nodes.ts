import type { WorkflowPorts } from './ports.js';
import { isRetrievedKnowledgeResult, type GraphState, type GraphUpdate } from './state.js';
import { handoffResult, injectionResult, knowledgeAnswerResult, mockFallbackResult, safeUnavailableResult } from './result-mapper.js';

export function createWorkflowNodes(ports: WorkflowPorts) {
  return {
    classifyRequest: (state: GraphState): GraphUpdate => ({
      policyDecision: ports.classifyUserRequest(state.inputContent),
    }),

    retrievePublished: async (state: GraphState): Promise<GraphUpdate> => {
      try {
        const retrievalResult = await ports.retrievePublished(state.inputContent);
        if (!isRetrievedKnowledgeResult(retrievalResult)) {
          return { path: 'mock_fallback', errorCode: 'INVALID_RETRIEVAL_RESULT' };
        }
        return { retrievalResult, path: 'inspect_knowledge' };
      } catch {
        return { path: 'mock_fallback', errorCode: 'RETRIEVAL_FAILED' };
      }
    },

    inspectKnowledge: (state: GraphState): GraphUpdate => {
      const retrievalResult = state.retrievalResult;
      if (!retrievalResult) return { path: 'mock_fallback', errorCode: 'MISSING_RETRIEVAL_RESULT' };
      if (retrievalResult.chunks.length === 0) return { path: 'no_match' };

      try {
        if (ports.containsUntrustedInstruction(retrievalResult.chunks)) {
          return { knowledgeSafetyResult: 'unsafe', path: 'unsafe_knowledge' };
        }
        const answer = retrievalResult.chunks.map((chunk) => chunk.answer).filter(Boolean).join('\n\n');
        if (!answer) return { path: 'mock_fallback', errorCode: 'EMPTY_KNOWLEDGE_ANSWER' };
        return { knowledgeSafetyResult: 'safe', path: 'knowledge_answer' };
      } catch {
        return { path: 'mock_fallback', errorCode: 'KNOWLEDGE_SAFETY_FAILED' };
      }
    },

    safeRefusal: (): GraphUpdate => ({ path: 'injection', result: injectionResult() }),
    handoffRecommended: (state: GraphState): GraphUpdate => ({
      path: state.path === 'unsafe_knowledge' ? 'unsafe_knowledge' : 'handoff',
      result: handoffResult(),
    }),
    safeUnavailable: (): GraphUpdate => ({ path: 'no_match', result: safeUnavailableResult() }),
    knowledgeAnswer: (state: GraphState): GraphUpdate => {
      const retrievalResult = state.retrievalResult;
      if (!retrievalResult) return { result: mockFallbackResult(), path: 'mock_fallback', errorCode: 'MISSING_RETRIEVAL_RESULT' };
      const answer = retrievalResult.chunks.map((chunk) => chunk.answer).filter(Boolean).join('\n\n');
      if (!answer) return { result: mockFallbackResult(), path: 'mock_fallback', errorCode: 'EMPTY_KNOWLEDGE_ANSWER' };
      return { result: knowledgeAnswerResult(answer, retrievalResult.citations) };
    },
    mockFallback: (): GraphUpdate => ({ path: 'mock_fallback', result: mockFallbackResult() }),
  };
}
