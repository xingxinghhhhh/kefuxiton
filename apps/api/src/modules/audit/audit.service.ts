import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export interface AuditRecordInput {
  conversationId?: string;
  handoffRequestId?: string;
  actorType: 'customer' | 'staff' | 'system';
  actorId?: string;
  action:
    | 'handoff_requested'
    | 'handoff_request_replayed'
    | 'handoff_claimed'
    | 'handoff_claim_replayed'
    | 'handoff_closed'
    | 'handoff_close_replayed';
  outcome: 'created' | 'replayed' | 'claimed' | 'closed';
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
        actorId: input.actorId,
        action: input.action,
        outcome: input.outcome,
        metadata: input.metadata,
      },
    });
  }
}
