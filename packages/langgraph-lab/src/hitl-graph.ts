import { END, interrupt, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import type { WorkflowPorts } from './ports.js';
import { isRetrievedKnowledgeResult } from './state.js';
import {
  createHandoffInterruptPayload,
  HitlStateAnnotation,
  isMissingResumeValue,
  parseHumanDecision,
  type HitlGraphStateFromAnnotation,
  type HitlGraphUpdate,
  type HitlPath,
  type HumanDecision,
} from './hitl-state.js';
import { toTraceRoute, type TraceNode, type TraceSink } from './trace-contract.js';
import {
  hitlApprovedHandoffResult,
  hitlDeniedResult,
  hitlInjectionResult,
  hitlKnowledgeAnswerResult,
  hitlMockFallbackResult,
  hitlSafeUnavailableResult,
} from './hitl-result-mapper.js';

type HitlNode = (state: HitlGraphStateFromAnnotation) => HitlGraphUpdate | Promise<HitlGraphUpdate>;

function wrapHitlNode(name: TraceNode, node: HitlNode, traceSink?: TraceSink): HitlNode {
  if (!traceSink) return node;
  return async (state: HitlGraphStateFromAnnotation) => {
    traceSink.recordNodeEntered(name);
    const update = await node(state);
    const rawRoute = 'path' in update ? update.path : undefined;
    const route = rawRoute === undefined ? null : toTraceRoute(rawRoute);
    if (rawRoute !== undefined && route === undefined) traceSink.setErrorCode('TRACE_ROUTE_UNKNOWN');
    traceSink.recordNodeCompleted(name, route ?? null);
    return update;
  };
}

export function createHumanReviewWorkflow(
  ports: WorkflowPorts,
  checkpointer: MemorySaver = new MemorySaver(),
  traceSink?: TraceSink,
) {
  const graph = new StateGraph(HitlStateAnnotation)
    .addNode('classify_request', wrapHitlNode('classify_request', (state: HitlGraphStateFromAnnotation): HitlGraphUpdate => ({
      policyDecision: ports.classifyUserRequest(state.inputContent),
    }), traceSink))
    .addNode('retrieve_published', wrapHitlNode('retrieve_published', async (state: HitlGraphStateFromAnnotation): Promise<HitlGraphUpdate> => {
      try {
        const retrievalResult = await ports.retrievePublished(state.inputContent);
        if (!isRetrievedKnowledgeResult(retrievalResult)) {
          return { path: 'mock_fallback', errorCode: undefined };
        }
        return { retrievalResult, path: 'inspect_knowledge' };
      } catch {
        return { path: 'mock_fallback', errorCode: undefined };
      }
    }, traceSink))
    .addNode('inspect_knowledge', wrapHitlNode('inspect_knowledge', (state: HitlGraphStateFromAnnotation): HitlGraphUpdate => {
      const retrievalResult = state.retrievalResult;
      if (!retrievalResult) return { path: 'mock_fallback' };
      if (retrievalResult.chunks.length === 0) return { path: 'no_match' };

      try {
        if (ports.containsUntrustedInstruction(retrievalResult.chunks)) {
          return { knowledgeSafetyResult: 'unsafe', path: 'unsafe_knowledge' };
        }
        const answer = retrievalResult.chunks.map((chunk) => chunk.answer).filter(Boolean).join('\n\n');
        if (!answer) return { path: 'mock_fallback' };
        return { knowledgeSafetyResult: 'safe', path: 'knowledge_answer' };
      } catch {
        return { path: 'mock_fallback' };
      }
    }, traceSink))
    .addNode('prepare_handoff_pause', wrapHitlNode('prepare_handoff_pause', (): HitlGraphUpdate => ({
      path: 'prepare_handoff_pause',
      handoffPause: createHandoffInterruptPayload(),
      resumeStatus: 'paused',
      terminalOutcome: undefined,
      result: undefined,
    }), traceSink))
    .addNode('request_human_decision', wrapHitlNode('request_human_decision', (state: HitlGraphStateFromAnnotation): HitlGraphUpdate => {
      const payload = state.handoffPause;
      if (!payload) return { path: 'fail_closed', resumeStatus: 'invalid', errorCode: 'HUMAN_DECISION_INVALID' };

      const rawDecision = interrupt<typeof payload, unknown>(payload);
      const decision = parseHumanDecision(rawDecision);
      if (!decision) {
        return {
          path: 'validate_human_decision',
          resumeStatus: 'invalid',
          errorCode: isMissingResumeValue(rawDecision) ? 'HUMAN_DECISION_MISSING' : 'HUMAN_DECISION_INVALID',
        };
      }
      return {
        path: 'validate_human_decision',
        humanDecision: decision,
        resumeStatus: decision.decision === 'approve_handoff' ? 'approved' : 'denied',
      };
    }, traceSink))
    .addNode('validate_human_decision', wrapHitlNode('validate_human_decision', (state: HitlGraphStateFromAnnotation): HitlGraphUpdate => {
      if (!state.humanDecision || state.resumeStatus === 'invalid') {
        return { path: 'fail_closed' };
      }
      return { path: 'validate_human_decision' };
    }, traceSink))
    .addNode('safe_refusal', wrapHitlNode('safe_refusal', (state: HitlGraphStateFromAnnotation): HitlGraphUpdate => {
      if (state.policyDecision === 'injection') {
        return { path: 'injection', result: hitlInjectionResult(), terminalOutcome: 'safe_refusal' };
      }
      return { path: 'safe_refusal', result: hitlDeniedResult(), terminalOutcome: 'safe_refusal' };
    }, traceSink))
    .addNode('handoff_recommended', wrapHitlNode('handoff_recommended', (): HitlGraphUpdate => ({
      path: 'handoff_recommended',
      result: hitlApprovedHandoffResult(),
      terminalOutcome: 'handoff_recommended',
    }), traceSink))
    .addNode('safe_unavailable', wrapHitlNode('safe_unavailable', (): HitlGraphUpdate => ({
      path: 'safe_unavailable',
      result: hitlSafeUnavailableResult(),
      terminalOutcome: 'safe_unavailable',
    }), traceSink))
    .addNode('knowledge_answer', wrapHitlNode('knowledge_answer', (state: HitlGraphStateFromAnnotation): HitlGraphUpdate => {
      const retrievalResult = state.retrievalResult;
      if (!retrievalResult) return { path: 'mock_fallback', result: hitlMockFallbackResult(), terminalOutcome: 'mock_fallback' };
      const answer = retrievalResult.chunks.map((chunk) => chunk.answer).filter(Boolean).join('\n\n');
      if (!answer) return { path: 'mock_fallback', result: hitlMockFallbackResult(), terminalOutcome: 'mock_fallback' };
      return {
        path: 'knowledge_answer',
        result: hitlKnowledgeAnswerResult(answer, retrievalResult.citations),
        terminalOutcome: 'knowledge_answer',
      };
    }, traceSink))
    .addNode('mock_fallback', wrapHitlNode('mock_fallback', (): HitlGraphUpdate => ({
      path: 'mock_fallback',
      result: hitlMockFallbackResult(),
      terminalOutcome: 'mock_fallback',
    }), traceSink))
    .addNode('fail_closed', wrapHitlNode('fail_closed', (): HitlGraphUpdate => ({
      path: 'fail_closed',
      result: hitlDeniedResult(),
      terminalOutcome: 'safe_refusal',
    }), traceSink))
    .addEdge(START, 'classify_request')
    .addConditionalEdges('classify_request', routeAfterClassify, {
      injection: 'safe_refusal',
      handoff: 'prepare_handoff_pause',
      allow: 'retrieve_published',
    })
    .addConditionalEdges('retrieve_published', routeAfterRetrieve, {
      inspect_knowledge: 'inspect_knowledge',
      mock_fallback: 'mock_fallback',
    })
    .addConditionalEdges('inspect_knowledge', routeAfterInspect, {
      unsafe_knowledge: 'prepare_handoff_pause',
      no_match: 'safe_unavailable',
      knowledge_answer: 'knowledge_answer',
      mock_fallback: 'mock_fallback',
    })
    .addEdge('prepare_handoff_pause', 'request_human_decision')
    .addEdge('request_human_decision', 'validate_human_decision')
    .addConditionalEdges('validate_human_decision', routeAfterHumanDecision, {
      approve_handoff: 'handoff_recommended',
      deny_handoff: 'safe_refusal',
      fail_closed: 'fail_closed',
    })
    .addEdge('safe_refusal', END)
    .addEdge('handoff_recommended', END)
    .addEdge('safe_unavailable', END)
    .addEdge('knowledge_answer', END)
    .addEdge('mock_fallback', END)
    .addEdge('fail_closed', END)
    .compile({ checkpointer });

  return graph;
}

function routeAfterClassify(state: HitlGraphStateFromAnnotation): 'injection' | 'handoff' | 'allow' {
  return state.policyDecision ?? 'handoff';
}

function routeAfterRetrieve(state: HitlGraphStateFromAnnotation): 'inspect_knowledge' | 'mock_fallback' {
  return state.path === 'inspect_knowledge' ? 'inspect_knowledge' : 'mock_fallback';
}

function routeAfterInspect(state: HitlGraphStateFromAnnotation): 'unsafe_knowledge' | 'no_match' | 'knowledge_answer' | 'mock_fallback' {
  if (state.path === 'unsafe_knowledge') return 'unsafe_knowledge';
  if (state.path === 'no_match') return 'no_match';
  if (state.path === 'knowledge_answer') return 'knowledge_answer';
  return 'mock_fallback';
}

function routeAfterHumanDecision(state: HitlGraphStateFromAnnotation): 'approve_handoff' | 'deny_handoff' | 'fail_closed' {
  if (state.resumeStatus === 'invalid' || !state.humanDecision) return 'fail_closed';
  return state.humanDecision.decision;
}

export type HumanReviewWorkflow = ReturnType<typeof createHumanReviewWorkflow>;

export function pathIsTerminal(path: HitlPath | undefined): boolean {
  return path === 'injection' || path === 'safe_refusal' || path === 'handoff_recommended' || path === 'safe_unavailable' || path === 'knowledge_answer' || path === 'mock_fallback' || path === 'fail_closed';
}

export type HumanDecisionValue = HumanDecision;
