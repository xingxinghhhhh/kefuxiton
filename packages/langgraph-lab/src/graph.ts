import { END, START, StateGraph } from '@langchain/langgraph';
import type { WorkflowPorts } from './ports.js';
import { createWorkflowNodes } from './nodes.js';
import { StateAnnotation, type AgentResultCompat, type GraphState, type GraphUpdate, type RequestPolicyDecision } from './state.js';
import { toTraceRoute, type TraceSink } from './trace-contract.js';

type WorkflowNode = (state: GraphState) => GraphUpdate | Promise<GraphUpdate>;

export function createLangGraphWorkflow(ports: WorkflowPorts, traceSink?: TraceSink) {
  const nodes = createWorkflowNodes(ports);
  const wrap = (name: Parameters<TraceSink['recordNodeEntered']>[0], node: WorkflowNode): WorkflowNode => {
    if (!traceSink) return node;
    return async (state: GraphState) => {
      traceSink.recordNodeEntered(name);
      const update = await node(state);
      const rawRoute = 'path' in update ? update.path : undefined;
      const route = rawRoute === undefined ? null : toTraceRoute(rawRoute);
      if (rawRoute !== undefined && route === undefined) traceSink.setErrorCode('TRACE_ROUTE_UNKNOWN');
      traceSink.recordNodeCompleted(name, route ?? null);
      return update;
    };
  };

  return new StateGraph(StateAnnotation)
    .addNode('classify_request', wrap('classify_request', nodes.classifyRequest))
    .addNode('retrieve_published', wrap('retrieve_published', nodes.retrievePublished))
    .addNode('inspect_knowledge', wrap('inspect_knowledge', nodes.inspectKnowledge))
    .addNode('safe_refusal', wrap('safe_refusal', nodes.safeRefusal))
    .addNode('handoff_recommended', wrap('handoff_recommended', nodes.handoffRecommended))
    .addNode('safe_unavailable', wrap('safe_unavailable', nodes.safeUnavailable))
    .addNode('knowledge_answer', wrap('knowledge_answer', nodes.knowledgeAnswer))
    .addNode('mock_fallback', wrap('mock_fallback', nodes.mockFallback))
    .addEdge(START, 'classify_request')
    .addConditionalEdges('classify_request', routeAfterClassify, {
      injection: 'safe_refusal',
      handoff: 'handoff_recommended',
      allow: 'retrieve_published',
    })
    .addConditionalEdges('retrieve_published', routeAfterRetrieve, {
      inspect_knowledge: 'inspect_knowledge',
      mock_fallback: 'mock_fallback',
    })
    .addConditionalEdges('inspect_knowledge', routeAfterInspect, {
      unsafe_knowledge: 'handoff_recommended',
      no_match: 'safe_unavailable',
      knowledge_answer: 'knowledge_answer',
      mock_fallback: 'mock_fallback',
    })
    .addEdge('safe_refusal', END)
    .addEdge('handoff_recommended', END)
    .addEdge('safe_unavailable', END)
    .addEdge('knowledge_answer', END)
    .addEdge('mock_fallback', END)
    .compile();
}

function routeAfterClassify(state: GraphState): RequestPolicyDecision {
  return state.policyDecision ?? 'handoff';
}

function routeAfterRetrieve(state: GraphState): 'inspect_knowledge' | 'mock_fallback' {
  return state.path === 'inspect_knowledge' ? 'inspect_knowledge' : 'mock_fallback';
}

function routeAfterInspect(state: GraphState): 'unsafe_knowledge' | 'no_match' | 'knowledge_answer' | 'mock_fallback' {
  if (state.path === 'unsafe_knowledge') return 'unsafe_knowledge';
  if (state.path === 'no_match') return 'no_match';
  if (state.path === 'knowledge_answer') return 'knowledge_answer';
  return 'mock_fallback';
}

export async function runLangGraphWorkflow(inputContent: string, ports: WorkflowPorts): Promise<GraphState> {
  return createLangGraphWorkflow(ports).invoke({ inputContent });
}

export async function runLangGraphResult(inputContent: string, ports: WorkflowPorts): Promise<AgentResultCompat> {
  const state = await runLangGraphWorkflow(inputContent, ports);
  if (!state.result) throw new Error('LangGraph workflow completed without a result');
  return state.result;
}
