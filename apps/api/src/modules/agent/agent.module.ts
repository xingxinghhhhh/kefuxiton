import { Module } from '@nestjs/common';
import { CURRENT_RELEASE_CAPABILITIES } from '@ai-agent/config';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { AGENT_CAPABILITY, AGENT_PORT } from './agent.port.js';
import { DeterministicKnowledgeAdapter } from './deterministic-knowledge.adapter.js';
import { MockAgentAdapter } from './mock-agent.adapter.js';

@Module({
  imports: [KnowledgeModule],
  providers: [
    MockAgentAdapter,
    DeterministicKnowledgeAdapter,
    { provide: AGENT_CAPABILITY, useValue: CURRENT_RELEASE_CAPABILITIES.agent },
    { provide: AGENT_PORT, useExisting: DeterministicKnowledgeAdapter },
  ],
  exports: [AGENT_PORT],
})
export class AgentModule {}
