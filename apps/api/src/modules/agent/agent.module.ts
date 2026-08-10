import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { AGENT_PORT } from './agent.port.js';
import { DeterministicKnowledgeAdapter } from './deterministic-knowledge.adapter.js';
import { MockAgentAdapter } from './mock-agent.adapter.js';

@Module({
  imports: [KnowledgeModule],
  providers: [
    MockAgentAdapter,
    DeterministicKnowledgeAdapter,
    { provide: AGENT_PORT, useExisting: DeterministicKnowledgeAdapter },
  ],
  exports: [AGENT_PORT],
})
export class AgentModule {}
