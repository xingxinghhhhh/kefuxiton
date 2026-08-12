import type { AgentResultCompat } from './state.js';

const INJECTION_MESSAGE = 'I cannot disclose system prompts, credentials, tokens, or hidden context.';
const HANDOFF_MESSAGE = 'This request needs human customer support because it crosses a safety or authorization boundary.';
const SAFE_UNAVAILABLE_MESSAGE = 'I cannot provide a reliable answer from the published knowledge available to this workflow.';
const MOCK_FALLBACK_MESSAGE = 'The deterministic workflow could not complete a reliable answer. Please contact human support.';

export function injectionResult(): AgentResultCompat {
  return {
    content: INJECTION_MESSAGE,
    agentMode: 'deterministic_knowledge',
    responseType: 'handoff_recommended',
    citations: [],
    handoffRecommended: true,
  };
}

export function handoffResult(): AgentResultCompat {
  return {
    content: HANDOFF_MESSAGE,
    agentMode: 'deterministic_knowledge',
    responseType: 'handoff_recommended',
    citations: [],
    handoffRecommended: true,
  };
}

export function safeUnavailableResult(): AgentResultCompat {
  return {
    content: SAFE_UNAVAILABLE_MESSAGE,
    agentMode: 'mock',
    responseType: 'safe_unavailable',
    citations: [],
    handoffRecommended: false,
  };
}

export function knowledgeAnswerResult(content: string, citations: AgentResultCompat['citations']): AgentResultCompat {
  return {
    content,
    agentMode: 'deterministic_knowledge',
    responseType: 'knowledge_answer',
    citations,
    handoffRecommended: false,
  };
}

export function mockFallbackResult(): AgentResultCompat {
  return {
    content: MOCK_FALLBACK_MESSAGE,
    agentMode: 'mock',
    responseType: 'mock_fallback',
    citations: [],
    handoffRecommended: false,
  };
}
