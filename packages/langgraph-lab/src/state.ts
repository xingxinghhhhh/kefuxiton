import type { Citation, ResponseType } from '@ai-agent/contracts';
import { Annotation } from '@langchain/langgraph';

export type RequestPolicyDecision = 'allow' | 'handoff' | 'injection';
export type KnowledgeSafetyResult = 'safe' | 'unsafe';
export type WorkflowPath =
  | 'injection'
  | 'handoff'
  | 'inspect_knowledge'
  | 'no_match'
  | 'unsafe_knowledge'
  | 'knowledge_answer'
  | 'mock_fallback';

export interface RetrievedKnowledgeChunk {
  id: string;
  title: string;
  version: string;
  contentSha256: string;
  sourceLocator: string;
  heading: string;
  question: string;
  answer: string;
  conditions: string;
  exceptions: string;
  content: string;
  score: number;
}

export interface RetrievedKnowledgeResult {
  chunks: RetrievedKnowledgeChunk[];
  citations: Citation[];
}

/** Keeps the lab output structurally identical to the production AgentResult without importing Nest or AgentPort. */
export interface AgentResultCompat {
  content: string;
  agentMode: 'mock' | 'deterministic_knowledge';
  responseType: ResponseType;
  citations: Citation[];
  handoffRecommended: boolean;
}

export const StateAnnotation = Annotation.Root({
  inputContent: Annotation<string>(),
  policyDecision: Annotation<RequestPolicyDecision | undefined>(),
  retrievalResult: Annotation<RetrievedKnowledgeResult | undefined>(),
  knowledgeSafetyResult: Annotation<KnowledgeSafetyResult | undefined>(),
  path: Annotation<WorkflowPath | undefined>(),
  result: Annotation<AgentResultCompat | undefined>(),
  errorCode: Annotation<string | undefined>(),
});

export type GraphState = typeof StateAnnotation.State;
export type GraphUpdate = typeof StateAnnotation.Update;

export function isRetrievedKnowledgeResult(value: unknown): value is RetrievedKnowledgeResult {
  if (!isRecord(value) || !Array.isArray(value.chunks) || !Array.isArray(value.citations)) return false;
  return value.chunks.every(isRetrievedKnowledgeChunk) && value.citations.every(isCitation);
}

function isRetrievedKnowledgeChunk(value: unknown): value is RetrievedKnowledgeChunk {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.title) &&
    isString(value.version) &&
    isString(value.contentSha256) &&
    isString(value.sourceLocator) &&
    isString(value.heading) &&
    isString(value.question) &&
    isString(value.answer) &&
    isString(value.conditions) &&
    isString(value.exceptions) &&
    isString(value.content) &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score)
  );
}

function isCitation(value: unknown): value is Citation {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.title) &&
    isString(value.uri) &&
    (value.version === undefined || isString(value.version)) &&
    isString(value.locator) &&
    isString(value.contentSha256)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
