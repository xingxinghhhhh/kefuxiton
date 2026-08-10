import { Injectable } from '@nestjs/common';
import type { AgentPort, AgentResult } from './agent.port.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { classifyUserRequest, containsUntrustedInstruction } from '../policy/request-policy.js';
import { MockAgentAdapter } from './mock-agent.adapter.js';

const HANDOFF_MESSAGE = '该问题涉及高风险、身份确认或安全边界，当前 Agent 不执行相关操作，建议转人工服务台处理。';
const INJECTION_MESSAGE = '我不能泄露系统提示、凭证或隐藏上下文。请提供不包含敏感信息的办公系统问题。';

@Injectable()
export class DeterministicKnowledgeAdapter implements AgentPort {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly mock: MockAgentAdapter,
  ) {}

  async respond(input: { content: string }): Promise<AgentResult> {
    const policy = classifyUserRequest(input.content);
    if (policy === 'injection') {
      return {
        content: INJECTION_MESSAGE,
        agentMode: 'deterministic_knowledge',
        responseType: 'handoff_recommended',
        citations: [],
        handoffRecommended: true,
      };
    }
    if (policy === 'handoff') {
      return {
        content: HANDOFF_MESSAGE,
        agentMode: 'deterministic_knowledge',
        responseType: 'handoff_recommended',
        citations: [],
        handoffRecommended: true,
      };
    }

    try {
      const result = await this.knowledge.retrieve(input.content);
      if (result.chunks.length === 0) return this.mock.respond(input);
      if (result.chunks.some((chunk) => containsUntrustedInstruction(chunk.content))) {
        return {
          content: '当前知识内容未通过安全校验，无法可靠回答，建议转人工服务台处理。',
          agentMode: 'deterministic_knowledge',
          responseType: 'safe_unavailable',
          citations: [],
          handoffRecommended: true,
        };
      }
      const answer = result.chunks.map((chunk) => chunk.answer).filter(Boolean).join('\n\n');
      if (!answer) return this.mock.respond(input);
      return {
        content: answer,
        agentMode: 'deterministic_knowledge',
        responseType: 'knowledge_answer',
        citations: result.citations,
        handoffRecommended: false,
      };
    } catch {
      const fallback = await this.mock.respond(input);
      return { ...fallback, responseType: 'mock_fallback' };
    }
  }
}
