import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AgentMode, ResponseType } from '@ai-agent/contracts';
import type { AgentPort } from '../agent/agent.port.js';
import { AGENT_PORT } from '../agent/agent.port.js';
import { createConversationToken, hashConversationToken } from './conversation-token.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { HandoffService } from '../handoff/handoff.service.js';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_PORT) private readonly agent: AgentPort,
    private readonly handoff: HandoffService,
  ) {}

  async createConversation() {
    const accessToken = createConversationToken();
    const conversation = await this.prisma.conversation.create({
      data: { accessTokenHash: hashConversationToken(accessToken) },
    });
    return {
      conversationId: conversation.id,
      accessToken,
      status: conversation.status,
      createdAt: conversation.createdAt.toISOString(),
    };
  }

  async sendMessage(conversationId: string, accessToken: string, content: string) {
    const authorizedConversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
      select: { id: true },
    });
    if (!authorizedConversation) throw new UnauthorizedException('会话凭证无效。');

    const handoffRequest = await this.handoff.getConversationRequest(conversationId);
    if (handoffRequest) {
      return this.prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.findFirst({
          where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
        });
        if (!conversation) throw new UnauthorizedException('会话凭证无效。');
        const userMessage = await tx.message.create({ data: { conversationId, role: 'user', content } });
        return {
          conversationId,
          messages: [this.toMessageView(userMessage)],
          agentMode: 'handoff' as const,
          responseType: 'handoff_pending' as const,
          citations: [],
          handoffRecommended: handoffRequest.status !== 'closed',
          handoffStatus: handoffRequest.status,
          handoffRequestId: handoffRequest.id,
          assistantMessageId: null,
        };
      });
    }

    const agentResult = await this.agent.respond({ content });
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
      });
      if (!conversation) throw new UnauthorizedException('会话凭证无效。');

      const userMessage = await tx.message.create({
        data: { conversationId, role: 'user', content },
      });
      const agentMessage = await tx.message.create({
        data: {
          conversationId,
          role: 'agent',
          content: agentResult.content,
          responseType: agentResult.responseType,
          agentMode: agentResult.agentMode,
          citations: agentResult.citations as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        conversationId,
        messages: [this.toMessageView(userMessage), this.toMessageView(agentMessage)],
        agentMode: agentResult.agentMode,
        responseType: agentResult.responseType,
        citations: agentResult.citations,
        handoffRecommended: agentResult.handoffRecommended,
        handoffStatus: null,
        handoffRequestId: null,
        assistantMessageId: agentMessage.id,
      };
    });
  }

  private toMessageView(message: {
    id: string;
    role: 'user' | 'agent';
    content: string;
    responseType: string | null;
    agentMode: string | null;
    citations: unknown;
    createdAt: Date;
  }) {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      responseType: message.responseType as ResponseType | null,
      agentMode: message.agentMode as AgentMode | null,
      citations: Array.isArray(message.citations) ? message.citations : [],
      createdAt: message.createdAt.toISOString(),
    };
  }
}
