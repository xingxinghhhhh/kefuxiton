import { END, START, StateGraph } from '@langchain/langgraph';
import type { WorkflowPorts } from './ports.js';
import { createWorkflowNodes } from './nodes.js';
import { StateAnnotation, type AgentResultCompat, type GraphState, type RequestPolicyDecision } from './state.js';

export function createLangGraphWorkflow(ports: WorkflowPorts) {
  const nodes = createWorkflowNodes(ports);
  return new StateGraph(StateAnnotation)
    .addNode('classify_request', nodes.classifyRequest)
    .addNode('retrieve_published', nodes.retrievePublished)
    .addNode('inspect_knowledge', nodes.inspectKnowledge)
    .addNode('safe_refusal', nodes.safeRefusal)
    .addNode('handoff_recommended', nodes.handoffRecommended)
    .addNode('safe_unavailable', nodes.safeUnavailable)
    .addNode('knowledge_answer', nodes.knowledgeAnswer)
    .addNode('mock_fallback', nodes.mockFallback)
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
