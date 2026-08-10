import { Module } from '@nestjs/common';
import { AgentModule } from './modules/agent/agent.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { KnowledgeModule } from './modules/knowledge/knowledge.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, KnowledgeModule, AgentModule, ConversationsModule],
  controllers: [HealthController],
})
export class AppModule {}
