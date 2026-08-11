import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FEEDBACK_VALUES, type AgentMode, type ConversationMessagesResponse, type FeedbackStatus, type FeedbackValue, type MessageFeedbackResponse, type MessageSenderType, type ResponseType } from '@ai-agent/contracts';
import type { AgentPort } from '../agent/agent.port.js';
import { AGENT_PORT } from '../agent/agent.port.js';
import { createConversationToken, hashConversationToken } from './conversation-token.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { HandoffService } from '../handoff/handoff.service.js';
import { AuditService } from '../audit/audit.service.js';

type FeedbackOperation =
  | { kind: 'success'; feedbackId: string; conversationId: string; messageId: string; value: FeedbackValue; status: FeedbackStatus; idempotent: boolean }
  | { kind: 'conflict'; code: 'FEEDBACK_CONFLICT' | 'IDEMPOTENCY_KEY_REUSED' };

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_PORT) private readonly agent: AgentPort,
    private readonly handoff: HandoffService,
    private readonly audit: AuditService,
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
    if (!authorizedConversation) throw new UnauthorizedException('conversation credential is invalid');

    const handoffRequest = await this.handoff.getConversationRequest(conversationId);
    if (handoffRequest) {
      return this.prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.findFirst({
          where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
        });
        if (!conversation) throw new UnauthorizedException('conversation credential is invalid');
        const userMessage = await tx.message.create({
          data: { conversationId, role: 'user', senderType: 'customer', content },
        });
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
      if (!conversation) throw new UnauthorizedException('conversation credential is invalid');

      const userMessage = await tx.message.create({
        data: { conversationId, role: 'user', senderType: 'customer', content },
      });
      const agentMessage = await tx.message.create({
        data: {
          conversationId,
          role: 'agent',
          content: agentResult.content,
          responseType: agentResult.responseType,
          agentMode: agentResult.agentMode,
          senderType: 'ai',
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

  async getMessages(conversationId: string, accessToken: string): Promise<ConversationMessagesResponse> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
      select: { id: true },
    });
    if (!conversation) throw new UnauthorizedException('conversation credential is invalid');
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: { feedbacks: { select: { value: true, createdAt: true }, take: 1 } },
    });
    return { conversationId, messages: messages.map((message) => this.toMessageView(message, message.feedbacks[0] ?? null)) };
  }

  async submitMessageFeedback(
    conversationId: string,
    accessToken: string,
    messageId: string,
    value: FeedbackValue,
    idempotencyKey: string,
  ): Promise<MessageFeedbackResponse> {
    const authorizedConversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
      select: { id: true },
    });
    if (!authorizedConversation) throw new UnauthorizedException('conversation credential is invalid');
    if (!FEEDBACK_VALUES.includes(value)) throw new ForbiddenException({ code: 'FEEDBACK_NOT_ALLOWED', message: '当前消息不允许反馈。' });

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { role: true, senderType: true, responseType: true, operatorReply: { select: { handoffRequestId: true } } },
    });
    if (!message || message.role !== 'agent' || (message.senderType !== 'ai' && message.senderType !== 'human_operator') || message.responseType === 'handoff_pending') {
      throw new ForbiddenException({ code: 'FEEDBACK_NOT_ALLOWED', message: '当前消息不允许反馈。' });
    }
    const handoffRequestId = message.senderType === 'human_operator' ? message.operatorReply?.handoffRequestId ?? null : null;

    let operation: FeedbackOperation;
    try {
      operation = await this.prisma.$transaction((tx) => this.recordOrResolveFeedback(tx, conversationId, messageId, value, idempotencyKey, handoffRequestId));
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      operation = await this.prisma.$transaction((tx) => this.resolveExistingFeedback(tx, conversationId, messageId, value, idempotencyKey, handoffRequestId));
    }

    if (operation.kind === 'conflict') {
      if (operation.code === 'FEEDBACK_CONFLICT') throw new ConflictException({ code: operation.code, message: '该消息已有不同反馈。' });
      throw new ConflictException({ code: operation.code, message: '幂等键已用于其他反馈。' });
    }
    return operation;
  }

  private async recordOrResolveFeedback(
    tx: Prisma.TransactionClient,
    conversationId: string,
    messageId: string,
    value: FeedbackValue,
    idempotencyKey: string,
    handoffRequestId: string | null,
  ): Promise<FeedbackOperation> {
    const existingByKey = await tx.messageFeedback.findUnique({ where: { conversationId_idempotencyKey: { conversationId, idempotencyKey } } });
    if (existingByKey) {
      if (existingByKey.messageId === messageId && existingByKey.value === value) {
        await this.recordFeedbackAudit(tx, 'message_feedback_replayed', 'replayed', existingByKey.id, conversationId, messageId, value, handoffRequestId);
        return { kind: 'success', feedbackId: existingByKey.id, conversationId, messageId, value, status: 'replayed', idempotent: true };
      }
      await this.recordFeedbackAudit(tx, 'message_feedback_conflict', 'conflict', existingByKey.id, conversationId, messageId, value, handoffRequestId);
      return { kind: 'conflict', code: 'IDEMPOTENCY_KEY_REUSED' };
    }

    const existingByMessage = await tx.messageFeedback.findUnique({ where: { conversationId_messageId: { conversationId, messageId } } });
    if (existingByMessage) {
      if (existingByMessage.value !== value) {
        await this.recordFeedbackAudit(tx, 'message_feedback_conflict', 'conflict', existingByMessage.id, conversationId, messageId, value, handoffRequestId);
        return { kind: 'conflict', code: 'FEEDBACK_CONFLICT' };
      }
      await this.recordFeedbackAudit(tx, 'message_feedback_replayed', 'replayed', existingByMessage.id, conversationId, messageId, value, handoffRequestId);
      return { kind: 'success', feedbackId: existingByMessage.id, conversationId, messageId, value, status: 'already_recorded', idempotent: true };
    }

    const created = await tx.messageFeedback.create({ data: { conversationId, messageId, value, idempotencyKey } });
    await this.recordFeedbackAudit(tx, 'message_feedback_created', 'created', created.id, conversationId, messageId, value, handoffRequestId);
    return { kind: 'success', feedbackId: created.id, conversationId, messageId, value, status: 'recorded', idempotent: false };
  }

  private resolveExistingFeedback(
    tx: Prisma.TransactionClient,
    conversationId: string,
    messageId: string,
    value: FeedbackValue,
    idempotencyKey: string,
    handoffRequestId: string | null,
  ) {
    return this.recordOrResolveFeedback(tx, conversationId, messageId, value, idempotencyKey, handoffRequestId);
  }

  private recordFeedbackAudit(
    tx: Prisma.TransactionClient,
    action: 'message_feedback_created' | 'message_feedback_replayed' | 'message_feedback_conflict',
    outcome: 'created' | 'replayed' | 'conflict',
    feedbackId: string,
    conversationId: string,
    messageId: string,
    value: FeedbackValue,
    handoffRequestId: string | null,
  ) {
    return this.audit.record(tx, {
      conversationId,
      handoffRequestId: handoffRequestId ?? undefined,
      actorType: 'customer',
      action,
      outcome,
      metadata: { feedbackId, conversationId, messageId, value },
    });
  }

  private toMessageView(message: {
    id: string;
    role: 'user' | 'agent';
    content: string;
    responseType: string | null;
    agentMode: string | null;
    senderType: string | null;
    citations: unknown;
    createdAt: Date;
  }, feedback: { value: string; createdAt: Date } | null = null) {
    const feedbackValue = feedback && FEEDBACK_VALUES.includes(feedback.value as FeedbackValue) ? feedback.value as FeedbackValue : null;
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      responseType: message.responseType as ResponseType | null,
      agentMode: message.agentMode as AgentMode | null,
      senderType: (message.senderType ?? (message.role === 'user' ? 'customer' : 'ai')) as MessageSenderType,
      citations: Array.isArray(message.citations) ? message.citations : [],
      createdAt: message.createdAt.toISOString(),
      feedback: feedbackValue && feedback ? { value: feedbackValue, submittedAt: feedback.createdAt.toISOString() } : null,
    };
  }
}
