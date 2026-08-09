import type { Citation, ResponseType } from '@ai-agent/contracts';

export interface AgentResult {
  content: string;
  agentMode: 'mock';
  responseType: ResponseType;
  citations: Citation[];
}

export interface AgentPort {
  respond(input: { content: string }): Promise<AgentResult>;
}

export const AGENT_PORT = Symbol('AGENT_PORT');
