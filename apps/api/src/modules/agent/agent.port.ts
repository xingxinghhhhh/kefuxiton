import type { Citation, ResponseType } from '@ai-agent/contracts';

export interface AgentResult {
  content: string;
  agentMode: 'mock' | 'deterministic_knowledge';
  responseType: ResponseType;
  citations: Citation[];
  handoffRecommended: boolean;
}

export interface AgentPort {
  respond(input: { content: string }): Promise<AgentResult>;
}

export const AGENT_PORT = Symbol('AGENT_PORT');
export const AGENT_CAPABILITY = Symbol('AGENT_CAPABILITY');
