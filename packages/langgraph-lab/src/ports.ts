import type { RequestPolicyDecision, RetrievedKnowledgeChunk } from './state.js';

export type PolicyClassifier = (content: string) => RequestPolicyDecision;
export type KnowledgeRetriever = (question: string) => Promise<unknown>;
export type KnowledgeSafetyChecker = (chunks: RetrievedKnowledgeChunk[]) => boolean;

export interface WorkflowPorts {
  classifyUserRequest: PolicyClassifier;
  retrievePublished: KnowledgeRetriever;
  containsUntrustedInstruction: KnowledgeSafetyChecker;
}
