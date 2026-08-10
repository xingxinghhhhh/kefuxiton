import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { HandoffModule } from '../handoff/handoff.module.js';

@Module({
  imports: [AgentModule, HandoffModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
