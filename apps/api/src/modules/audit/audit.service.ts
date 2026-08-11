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
    | 'handoff_close_replayed'
    | 'operator_reply_created'
    | 'operator_reply_replayed'
    | 'internal_note_created'
    | 'internal_note_replayed'
    | 'conversation_tag_added'
    | 'conversation_tag_add_replayed'
    | 'conversation_tag_removed'
    | 'conversation_tag_remove_replayed'
    | 'message_feedback_created'
    | 'message_feedback_replayed'
    | 'message_feedback_conflict';
  outcome: 'created' | 'replayed' | 'claimed' | 'closed' | 'removed' | 'conflict';
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
