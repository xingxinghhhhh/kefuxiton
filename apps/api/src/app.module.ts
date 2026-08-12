import { Module } from '@nestjs/common';
import { AgentModule } from './modules/agent/agent.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { KnowledgeModule } from './modules/knowledge/knowledge.module.js';
import { HandoffModule } from './modules/handoff/handoff.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, HealthModule, KnowledgeModule, AgentModule, HandoffModule, ConversationsModule],
})
export class AppModule {}
