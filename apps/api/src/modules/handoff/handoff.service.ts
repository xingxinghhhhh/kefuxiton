import { Injectable, UnauthorizedException } from '@nestjs/common';
import { HandoffRequestStatus, Prisma } from '@prisma/client';
import type { HandoffRequestResponse } from '@ai-agent/contracts';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashConversationToken } from '../conversations/conversation-token.js';

@Injectable()
export class HandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async request(conversationId: string, accessToken: string, reasonCode: 'customer_requested'): Promise<HandoffRequestResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
        select: { id: true },
      });
      if (!conversation) throw new UnauthorizedException('会话凭证无效。');

      const existing = await tx.handoffRequest.findFirst({
        where: { conversationId, status: HandoffRequestStatus.requested },
        orderBy: { requestedAt: 'desc' },
      });
      if (existing) {
        await this.audit.record(tx, {
          conversationId,
          handoffRequestId: existing.id,
          actorType: 'customer',
          action: 'handoff_request_replayed',
          outcome: 'replayed',
          metadata: { reasonCode },
        });
        return this.toResponse(existing, true);
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
      return this.toResponse(request, false);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.handoffRequest.findFirst({
        where: { conversationId, status: HandoffRequestStatus.requested },
        orderBy: { requestedAt: 'desc' },
      });
      if (!existing) throw error;
      await this.prisma.$transaction(async (tx) => {
        await this.audit.record(tx, {
          conversationId,
          handoffRequestId: existing.id,
          actorType: 'customer',
          action: 'handoff_request_replayed',
          outcome: 'replayed',
          metadata: { reasonCode },
        });
      });
      return this.toResponse(existing, true);
    }
  }

  async getStatus(conversationId: string, accessToken: string): Promise<HandoffRequestResponse | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
      select: { id: true },
    });
    if (!conversation) throw new UnauthorizedException('会话凭证无效。');
    const request = await this.prisma.handoffRequest.findFirst({
      where: { conversationId },
      orderBy: { requestedAt: 'desc' },
    });
    return request ? this.toResponse(request, false) : null;
  }

  async getActiveRequest(conversationId: string) {
    return this.prisma.handoffRequest.findFirst({
      where: { conversationId, status: HandoffRequestStatus.requested },
      orderBy: { requestedAt: 'desc' },
    });
  }

  private toResponse(request: {
    id: string;
    conversationId: string;
    status: HandoffRequestStatus;
    reasonCode: string;
    requestedAt: Date;
    updatedAt: Date;
  }, idempotent: boolean): HandoffRequestResponse {
    return {
      conversationId: request.conversationId,
      requestId: request.id,
      status: request.status,
      reasonCode: request.reasonCode,
      requestedAt: request.requestedAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      idempotent,
    };
  }
}
