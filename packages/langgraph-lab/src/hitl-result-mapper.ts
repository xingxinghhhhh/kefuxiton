import type { Citation } from '@ai-agent/contracts';
import { handoffResult, injectionResult, knowledgeAnswerResult, mockFallbackResult, safeUnavailableResult } from './result-mapper.js';
import type { AgentResultCompat } from './state.js';

export function hitlInjectionResult(): AgentResultCompat {
  return injectionResult();
}

export function hitlApprovedHandoffResult(): AgentResultCompat {
  return handoffResult();
}

export function hitlDeniedResult(): AgentResultCompat {
  return safeUnavailableResult();
}

export function hitlSafeUnavailableResult(): AgentResultCompat {
  return safeUnavailableResult();
}

export function hitlKnowledgeAnswerResult(content: string, citations: Citation[]): AgentResultCompat {
  return knowledgeAnswerResult(content, citations);
}

export function hitlMockFallbackResult(): AgentResultCompat {
  return mockFallbackResult();
}
