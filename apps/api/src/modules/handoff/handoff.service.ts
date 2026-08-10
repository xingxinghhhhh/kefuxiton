import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { HandoffRequestStatus, Prisma } from '@prisma/client';
import type {
  HandoffActionResponse,
  HandoffRequestResponse,
  HandoffRequestStatus as ContractHandoffRequestStatus,
  MessageSenderType,
  ResponseType,
  StaffHandoffListResponse,
  StaffHandoffRequest,
  StaffReplyResponse,
} from '@ai-agent/contracts';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashConversationToken } from '../conversations/conversation-token.js';
import type { StaffPrincipal } from '../auth/staff-identity.port.js';

const SUPPRESSING_STATUSES: HandoffRequestStatus[] = [
  HandoffRequestStatus.requested,
  HandoffRequestStatus.claimed,
  HandoffRequestStatus.closed,
];

@Injectable()
export class HandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async request(conversationId: string, accessToken: string, reasonCode: 'customer_requested'): Promise<HandoffRequestResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.authorizeConversation(tx, conversationId, accessToken);
        const existing = await tx.handoffRequest.findFirst({ where: { conversationId }, orderBy: { requestedAt: 'desc' } });
        if (existing) {
          if (existing.status === HandoffRequestStatus.closed) throw new ConflictException('handoff request is closed');
          await this.recordReplay(tx, existing, reasonCode);
          return this.toCustomerResponse(existing, true);
        }

        const request = await tx.handoffRequest.create({
          data: { conversationId, reasonCode, activeKey: conversationId },
        });
        await this.audit.record(tx, {
          conversationId,
          handoffRequestId: request.id,
          actorType: 'customer',
          action: 'handoff_requested',
          outcome: 'created',
          metadata: { reasonCode },
        });
        return this.toCustomerResponse(request, false);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.handoffRequest.findFirst({
        where: { conversationId, status: { in: [HandoffRequestStatus.requested, HandoffRequestStatus.claimed] } },
        orderBy: { requestedAt: 'desc' },
      });
      if (!existing) throw error;
      await this.prisma.$transaction((tx) => this.recordReplay(tx, existing, reasonCode));
      return this.toCustomerResponse(existing, true);
    }
  }

  async getStatus(conversationId: string, accessToken: string): Promise<HandoffRequestResponse | null> {
    await this.authorizeConversation(this.prisma, conversationId, accessToken);
    const request = await this.getConversationRequest(conversationId);
    return request ? this.toCustomerResponse(request, false) : null;
  }

  async getConversationRequest(conversationId: string) {
    return this.prisma.handoffRequest.findFirst({
      where: { conversationId, status: { in: SUPPRESSING_STATUSES } },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async listForStaff(status?: HandoffRequestStatus): Promise<StaffHandoffListResponse> {
    const requests = await this.prisma.handoffRequest.findMany({
      where: status ? { status } : undefined,
      include: { conversation: { include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } } } },
      orderBy: { requestedAt: 'asc' },
    });
    return { items: requests.map((request) => this.toStaffResponse(request)) };
  }

  async getForStaff(requestId: string): Promise<StaffHandoffRequest> {
    const request = await this.prisma.handoffRequest.findUnique({
      where: { id: requestId },
      include: { conversation: { include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } } } },
    });
    if (!request) throw new NotFoundException('handoff request not found');
    return this.toStaffResponse(request);
  }

  async claim(requestId: string, principal: StaffPrincipal, correlationId: string): Promise<HandoffActionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.handoffRequest.findUnique({ where: { id: requestId } });
      if (!current) throw new NotFoundException('handoff request not found');
      if (current.status === HandoffRequestStatus.closed) throw new ConflictException('closed handoff cannot be claimed');
      if (current.status === HandoffRequestStatus.claimed) {
        await this.audit.record(tx, {
          conversationId: current.conversationId,
          handoffRequestId: current.id,
          actorType: 'staff',
          actorId: principal.staffId,
          action: 'handoff_claim_replayed',
          outcome: 'replayed',
          metadata: { requestId: correlationId },
        });
        return { requestId: current.id, status: 'claimed' as const, idempotent: true };
      }

      const result = await tx.handoffRequest.updateMany({
        where: { id: requestId, status: HandoffRequestStatus.requested },
        data: { status: HandoffRequestStatus.claimed, claimedBy: principal.staffId, claimedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictException('handoff state changed; retry after refresh');
      await this.audit.record(tx, {
        conversationId: current.conversationId,
        handoffRequestId: current.id,
        actorType: 'staff',
        actorId: principal.staffId,
        action: 'handoff_claimed',
        outcome: 'claimed',
        metadata: { requestId: correlationId },
      });
      return { requestId: current.id, status: 'claimed' as const, idempotent: false };
    });
  }

  async close(requestId: string, principal: StaffPrincipal, correlationId: string): Promise<HandoffActionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.handoffRequest.findUnique({ where: { id: requestId } });
      if (!current) throw new NotFoundException('handoff request not found');
      if (current.status === HandoffRequestStatus.closed) {
        await this.audit.record(tx, {
          conversationId: current.conversationId,
          handoffRequestId: current.id,
          actorType: 'staff',
          actorId: principal.staffId,
          action: 'handoff_close_replayed',
          outcome: 'replayed',
          metadata: { requestId: correlationId },
        });
        return { requestId: current.id, status: 'closed' as const, idempotent: true };
      }
      if (current.status !== HandoffRequestStatus.claimed) throw new ConflictException('handoff must be claimed before closing');

      const result = await tx.handoffRequest.updateMany({
        where: { id: requestId, status: HandoffRequestStatus.claimed },
        data: { status: HandoffRequestStatus.closed, activeKey: null, closedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictException('handoff state changed; retry after refresh');
      await this.audit.record(tx, {
        conversationId: current.conversationId,
        handoffRequestId: current.id,
        actorType: 'staff',
        actorId: principal.staffId,
        action: 'handoff_closed',
        outcome: 'closed',
        metadata: { requestId: correlationId },
      });
      return { requestId: current.id, status: 'closed' as const, idempotent: false };
    });
  }

  async reply(
    requestId: string,
    principal: StaffPrincipal,
    content: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<StaffReplyResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.handoffRequest.findUnique({ where: { id: requestId } });
        if (!current) throw new NotFoundException('handoff request not found');
        if (current.status !== HandoffRequestStatus.claimed) throw new ConflictException('only claimed handoffs accept replies');
        if (current.claimedBy !== principal.staffId) throw new ForbiddenException('only the claiming Operator can reply');

        const existing = await tx.operatorReply.findUnique({
          where: { handoffRequestId_idempotencyKey: { handoffRequestId: requestId, idempotencyKey } },
          include: { message: true },
        });
        if (existing) {
          await this.recordReplyAudit(tx, current, principal, existing.id, existing.message.id, correlationId, true);
          return this.toReplyResponse(requestId, existing.id, existing.message, true);
        }

        const message = await tx.message.create({
          data: {
            conversationId: current.conversationId,
            role: 'agent',
            content,
            senderType: 'human_operator',
            responseType: 'human_reply',
            agentMode: 'human_operator',
            citations: [],
          },
        });
        const reply = await tx.operatorReply.create({
          data: { handoffRequestId: current.id, messageId: message.id, operatorId: principal.staffId, idempotencyKey },
        });
        await this.recordReplyAudit(tx, current, principal, reply.id, message.id, correlationId, false);
        return this.toReplyResponse(requestId, reply.id, message, false);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const current = await this.prisma.handoffRequest.findUnique({ where: { id: requestId } });
      if (!current) throw error;
      if (current.status !== HandoffRequestStatus.claimed) throw new ConflictException('handoff state changed; retry after refresh');
      if (current.claimedBy !== principal.staffId) throw new ForbiddenException('only the claiming Operator can reply');
      const existing = await this.prisma.operatorReply.findUnique({
        where: { handoffRequestId_idempotencyKey: { handoffRequestId: requestId, idempotencyKey } },
        include: { message: true },
      });
      if (!existing) throw error;
      await this.prisma.$transaction((tx) => this.recordReplyAudit(tx, current, principal, existing.id, existing.message.id, correlationId, true));
      return this.toReplyResponse(requestId, existing.id, existing.message, true);
    }
  }

  private async authorizeConversation(
    client: Pick<PrismaService, 'conversation'>,
    conversationId: string,
    accessToken: string,
  ) {
    const conversation = await client.conversation.findFirst({
      where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
      select: { id: true },
    });
    if (!conversation) throw new UnauthorizedException('conversation credential is invalid');
  }

  private recordReplay(tx: Prisma.TransactionClient, request: { id: string; conversationId: string }, reasonCode: string) {
    return this.audit.record(tx, {
      conversationId: request.conversationId,
      handoffRequestId: request.id,
      actorType: 'customer',
      action: 'handoff_request_replayed',
      outcome: 'replayed',
      metadata: { reasonCode },
    });
  }

  private recordReplyAudit(
    tx: Prisma.TransactionClient,
    request: { id: string; conversationId: string },
    principal: StaffPrincipal,
    replyId: string,
    messageId: string,
    correlationId: string,
    replayed: boolean,
  ) {
    return this.audit.record(tx, {
      conversationId: request.conversationId,
      handoffRequestId: request.id,
      actorType: 'staff',
      actorId: principal.staffId,
      action: replayed ? 'operator_reply_replayed' : 'operator_reply_created',
      outcome: replayed ? 'replayed' : 'created',
      metadata: { replyId, messageId, requestId: correlationId },
    });
  }

  private toCustomerResponse(request: {
    id: string;
    conversationId: string;
    status: HandoffRequestStatus;
    reasonCode: string;
    requestedAt: Date;
    updatedAt: Date;
    claimedAt: Date | null;
    closedAt: Date | null;
  }, idempotent: boolean): HandoffRequestResponse {
    return {
      conversationId: request.conversationId,
      requestId: request.id,
      status: request.status as ContractHandoffRequestStatus,
      reasonCode: request.reasonCode,
      requestedAt: request.requestedAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      idempotent,
      ...(request.claimedAt ? { claimedAt: request.claimedAt.toISOString() } : {}),
      ...(request.closedAt ? { closedAt: request.closedAt.toISOString() } : {}),
    };
  }

  private toStaffResponse(request: {
    id: string;
    conversationId: string;
    status: HandoffRequestStatus;
    reasonCode: string;
    requestedAt: Date;
    updatedAt: Date;
    claimedBy: string | null;
    claimedAt: Date | null;
    closedAt: Date | null;
    conversation: { messages: Array<{ id: string; role: string; content: string; senderType: string | null; createdAt: Date }> };
  }): StaffHandoffRequest {
    return {
      requestId: request.id,
      conversationId: request.conversationId,
      status: request.status as ContractHandoffRequestStatus,
      reasonCode: request.reasonCode,
      requestedAt: request.requestedAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      claimedBy: request.claimedBy,
      claimedAt: request.claimedAt?.toISOString() ?? null,
      closedAt: request.closedAt?.toISOString() ?? null,
      recentMessages: request.conversation.messages.slice().reverse().map((message) => ({
        id: message.id,
        role: message.role as 'user' | 'agent',
        senderType: (message.senderType ?? (message.role === 'user' ? 'customer' : 'ai')) as MessageSenderType,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  private toReplyResponse(
    requestId: string,
    replyId: string,
    message: {
      id: string;
      role: 'user' | 'agent';
      content: string;
      responseType: string | null;
      agentMode: string | null;
      senderType: string | null;
      citations: unknown;
      createdAt: Date;
    },
    idempotent: boolean,
  ): StaffReplyResponse {
    return { requestId, replyId, message: this.toMessageView(message), idempotent };
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
  }) {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      responseType: message.responseType as ResponseType | null,
      agentMode: message.agentMode as 'mock' | 'deterministic_knowledge' | 'handoff' | 'human_operator' | null,
      senderType: (message.senderType ?? (message.role === 'user' ? 'customer' : 'ai')) as MessageSenderType,
      citations: Array.isArray(message.citations) ? message.citations : [],
      createdAt: message.createdAt.toISOString(),
    };
  }
}
