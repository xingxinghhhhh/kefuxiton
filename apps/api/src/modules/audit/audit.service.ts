import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export interface AuditRecordInput {
  conversationId?: string;
  handoffRequestId?: string;
  actorType: 'customer' | 'system';
  action: 'handoff_requested' | 'handoff_request_replayed';
  outcome: 'created' | 'replayed';
  metadata?: Record<string, string>;
}

@Injectable()
export class AuditService {
  record(tx: Prisma.TransactionClient, input: AuditRecordInput) {
    return tx.auditEvent.create({
      data: {
        conversationId: input.conversationId,
        handoffRequestId: input.handoffRequestId,
        actorType: input.actorType,
        action: input.action,
        outcome: input.outcome,
        metadata: input.metadata,
      },
    });
  }
}
