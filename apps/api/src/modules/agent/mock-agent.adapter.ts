import { Injectable } from '@nestjs/common';
import type { AgentPort, AgentResult } from './agent.port.js';

@Injectable()
export class MockAgentAdapter implements AgentPort {
  async respond(_input: { content: string }): Promise<AgentResult> {
    return {
      content: '当前演示环境尚未接入已发布知识库，暂时无法可靠回答该问题。',
      agentMode: 'mock',
      responseType: 'safe_unavailable',
      citations: [],
      handoffRecommended: false,
    };
  }
}
