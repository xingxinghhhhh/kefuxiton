import { Module } from '@nestjs/common';
import { AGENT_PORT } from './agent.port.js';
import { MockAgentAdapter } from './mock-agent.adapter.js';

@Module({
  providers: [MockAgentAdapter, { provide: AGENT_PORT, useExisting: MockAgentAdapter }],
  exports: [AGENT_PORT],
})
export class AgentModule {}
