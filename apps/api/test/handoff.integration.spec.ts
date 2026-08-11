import { PrismaClient } from '@prisma/client';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { HandoffService } from '../src/modules/handoff/handoff.service.js';
import { ConversationsService } from '../src/modules/conversations/conversations.service.js';
import { MockAgentAdapter } from '../src/modules/agent/mock-agent.adapter.js';
import { hashConversationToken } from '../src/modules/conversations/conversation-token.js';
import type { StaffPrincipal } from '../src/modules/auth/staff-identity.port.js';

const describeReal = process.env.RUN_REAL_DB_TESTS === '1' ? describe : describe.skip;

describeReal('handoff request loop', () => {
  const prisma = new PrismaClient();
  const audit = new AuditService();
  const handoff = new HandoffService(prisma as never, audit);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates one request, audits replay, and suppresses automatic replies', async () => {
    const accessToken = `handoff-test-${Date.now()}`;
    const conversation = await prisma.conversation.create({
      data: { accessTokenHash: hashConversationToken(accessToken) },
    });

    try {
      const first = await handoff.request(conversation.id, accessToken, 'customer_requested');
      const replay = await handoff.request(conversation.id, accessToken, 'customer_requested');
      expect(first.idempotent).toBe(false);
      expect(replay.idempotent).toBe(true);
      expect(replay.requestId).toBe(first.requestId);

      const events = await prisma.auditEvent.findMany({ where: { handoffRequestId: first.requestId } });
      expect(events.map((event) => event.action).sort()).toEqual(['handoff_request_replayed', 'handoff_requested']);

      const agent = new MockAgentAdapter();
      const conversations = new ConversationsService(prisma as never, agent, handoff, audit);
      const suppressed = await conversations.sendMessage(conversation.id, accessToken, '请继续回答');
      expect(suppressed.responseType).toBe('handoff_pending');
      expect(suppressed.agentMode).toBe('handoff');
      expect(suppressed.handoffStatus).toBe('requested');
      expect(suppressed.messages).toHaveLength(1);
      expect(suppressed.citations).toEqual([]);
    } finally {
      await prisma.conversation.delete({ where: { id: conversation.id } });
    }
  });

  it('does not disclose the request for another conversation credential', async () => {
    const accessToken = `handoff-test-invalid-${Date.now()}`;
    const conversation = await prisma.conversation.create({
      data: { accessTokenHash: hashConversationToken(accessToken) },
    });
    try {
      await expect(handoff.request(conversation.id, 'wrong-token', 'customer_requested')).rejects.toThrow('conversation credential is invalid');
      expect(await prisma.handoffRequest.count({ where: { conversationId: conversation.id } })).toBe(0);
    } finally {
      await prisma.conversation.delete({ where: { id: conversation.id } });
    }
  });

  it('supports an authorized operator claim/close lifecycle without restoring AI', async () => {
    const accessToken = `handoff-staff-test-${Date.now()}`;
    const conversation = await prisma.conversation.create({
      data: { accessTokenHash: hashConversationToken(accessToken) },
    });
    const principal: StaffPrincipal = {
      staffId: 'test-operator',
      permissions: ['handoff:read', 'handoff:claim', 'handoff:close', 'conversation:read'],
    };

    try {
      const request = await handoff.request(conversation.id, accessToken, 'customer_requested');
      expect((await handoff.listForStaff('requested')).items.some((item) => item.requestId === request.requestId)).toBe(true);
      expect((await handoff.getForStaff(request.requestId)).recentMessages).toEqual([]);

      const claim = await handoff.claim(request.requestId, principal, 'integration-claim');
      expect(claim).toEqual({ requestId: request.requestId, status: 'claimed', idempotent: false });
      expect(await handoff.claim(request.requestId, principal, 'integration-claim-replay')).toEqual({
        requestId: request.requestId,
        status: 'claimed',
        idempotent: true,
      });
      expect((await handoff.getStatus(conversation.id, accessToken))?.status).toBe('claimed');

      const close = await handoff.close(request.requestId, principal, 'integration-close', 'operator_completed', 'resolved');
      expect(close).toEqual({
        requestId: request.requestId,
        status: 'closed',
        closeReason: 'operator_completed',
        resolutionCode: 'resolved',
        idempotent: false,
      });
      expect(await handoff.close(request.requestId, principal, 'integration-close-replay', 'operator_completed', 'resolved')).toEqual({
        requestId: request.requestId,
        status: 'closed',
        closeReason: 'operator_completed',
        resolutionCode: 'resolved',
        idempotent: true,
      });
      await expect(handoff.close(request.requestId, principal, 'integration-close-conflict', 'unable_to_resolve', 'unresolved'))
        .rejects.toThrow('closed handoff outcome cannot be changed');
      expect((await handoff.getStatus(conversation.id, accessToken))?.status).toBe('closed');
      expect((await handoff.getForStaff(request.requestId)).closeReason).toBe('operator_completed');
      expect((await handoff.getForStaff(request.requestId)).resolutionCode).toBe('resolved');
      const timeline = await handoff.getAuditTimeline(request.requestId, 100);
      const closeEvent = timeline.items.find((item) => item.action === 'handoff_closed');
      expect(closeEvent).toMatchObject({ closeReason: 'operator_completed', resolutionCode: 'resolved' });

      const conversations = new ConversationsService(prisma as never, new MockAgentAdapter(), handoff, audit);
      const suppressed = await conversations.sendMessage(conversation.id, accessToken, 'closed status message');
      expect(suppressed.responseType).toBe('handoff_pending');
      expect(suppressed.messages).toHaveLength(1);
      expect(suppressed.handoffRecommended).toBe(false);
      expect(await prisma.auditEvent.count({ where: { handoffRequestId: request.requestId } })).toBe(5);
    } finally {
      await prisma.conversation.delete({ where: { id: conversation.id } });
    }
  });

  it('validates structured close outcomes, keeps legacy close compatible, and preserves historical nulls', async () => {
    const accessToken = `handoff-close-outcome-test-${Date.now()}`;
    const conversation = await prisma.conversation.create({ data: { accessTokenHash: hashConversationToken(accessToken) } });
    const principal: StaffPrincipal = {
      staffId: 'close-outcome-operator',
      permissions: ['handoff:read', 'handoff:claim', 'handoff:close', 'conversation:read'],
    };
    const otherPrincipal: StaffPrincipal = { ...principal, staffId: 'different-close-operator' };
    try {
      const request = await handoff.request(conversation.id, accessToken, 'customer_requested');
      await handoff.claim(request.requestId, principal, 'close-outcome-claim');
      await expect(handoff.close(request.requestId, principal, 'missing-resolution', 'operator_completed'))
        .rejects.toThrow('closeReason and resolutionCode must be provided together');
      await expect(handoff.close(request.requestId, principal, 'invalid-enum', 'not-a-reason', 'resolved'))
        .rejects.toThrow('closeReason or resolutionCode is not allowed');
      await expect(handoff.close(request.requestId, otherPrincipal, 'wrong-operator', 'operator_completed', 'resolved'))
        .rejects.toThrow('only the claiming Operator can close');

      const legacyClose = await handoff.close(request.requestId, principal, 'legacy-close');
      expect(legacyClose).toMatchObject({
        requestId: request.requestId,
        status: 'closed',
        closeReason: 'legacy_unclassified',
        resolutionCode: 'legacy_unclassified',
        idempotent: false,
      });
      expect(await handoff.close(request.requestId, principal, 'legacy-replay')).toEqual({ ...legacyClose, idempotent: true });
      expect(await prisma.handoffRequest.findUnique({ where: { id: request.requestId }, select: { closeReason: true, resolutionCode: true } }))
        .toEqual({ closeReason: 'legacy_unclassified', resolutionCode: 'legacy_unclassified' });

      const historicalToken = `${accessToken}-historical`;
      const historicalConversation = await prisma.conversation.create({ data: { accessTokenHash: hashConversationToken(historicalToken) } });
      try {
        const historicalRequest = await handoff.request(historicalConversation.id, historicalToken, 'customer_requested');
        await handoff.claim(historicalRequest.requestId, principal, 'historical-claim');
        await prisma.handoffRequest.update({
          where: { id: historicalRequest.requestId },
          data: { status: 'closed', activeKey: null, closedAt: new Date() },
        });
        await expect(handoff.close(historicalRequest.requestId, principal, 'historical-replay')).resolves.toMatchObject({
          closeReason: null,
          resolutionCode: null,
          idempotent: true,
        });
      } finally {
        await prisma.conversation.delete({ where: { id: historicalConversation.id } });
      }
    } finally {
      await prisma.conversation.delete({ where: { id: conversation.id } });
    }
  });

  it('persists an idempotent human reply for the claiming operator and exposes it to the customer', async () => {
    const accessToken = `handoff-reply-test-${Date.now()}`;
    const conversation = await prisma.conversation.create({
      data: { accessTokenHash: hashConversationToken(accessToken) },
    });
    const principal: StaffPrincipal = {
      staffId: 'reply-operator',
      permissions: ['handoff:read', 'handoff:claim', 'handoff:close', 'handoff:reply', 'conversation:read'],
    };
    const otherPrincipal: StaffPrincipal = { ...principal, staffId: 'other-operator' };

    try {
      const request = await handoff.request(conversation.id, accessToken, 'customer_requested');
      const conversations = new ConversationsService(prisma as never, new MockAgentAdapter(), handoff, audit);
      await conversations.sendMessage(conversation.id, accessToken, 'waiting for an operator');
      await expect(handoff.reply(request.requestId, principal, 'not claimed yet', 'before-claim', 'reply-before-claim'))
        .rejects.toThrow('only claimed handoffs accept replies');
      await handoff.claim(request.requestId, principal, 'reply-claim');
      await expect(handoff.reply(request.requestId, otherPrincipal, 'not allowed', 'other-key', 'reply-forbidden'))
        .rejects.toThrow('only the claiming Operator can reply');

      const first = await handoff.reply(request.requestId, principal, '人工回复内容', 'reply-key-1', 'reply-request-1');
      const replay = await handoff.reply(request.requestId, principal, 'different content is ignored', 'reply-key-1', 'reply-request-2');
      expect(first.idempotent).toBe(false);
      expect(replay).toEqual({ ...first, idempotent: true });
      expect(first.message.senderType).toBe('human_operator');
      expect(first.message.responseType).toBe('human_reply');

      const history = await conversations.getMessages(conversation.id, accessToken);
      const feedback = await conversations.submitMessageFeedback(conversation.id, accessToken, first.message.id, 'helpful', 'reply-feedback-1');
      expect(feedback).toMatchObject({ messageId: first.message.id, value: 'helpful', status: 'recorded', idempotent: false });
      const legacyFeedbackEvent = await prisma.auditEvent.create({
        data: {
          conversationId: conversation.id,
          actorType: 'customer',
          action: 'message_feedback_created',
          outcome: 'created',
          metadata: { feedbackId: 'legacy-feedback', conversationId: conversation.id, messageId: first.message.id, value: 'helpful' },
        },
      });
      const timelineWithFeedback = await handoff.getAuditTimeline(request.requestId, 100);
      expect(timelineWithFeedback.items.find((item) => item.action === 'message_feedback_created')).toMatchObject({
        feedbackValue: 'helpful',
        actorType: 'customer',
        actorRef: null,
        subjectType: 'message',
        subjectRef: first.message.id,
      });
      expect(timelineWithFeedback.items.some((item) => item.eventId === legacyFeedbackEvent.id)).toBe(false);
      expect(history.messages.at(-1)).toMatchObject({ content: '人工回复内容', senderType: 'human_operator' });
      expect(await prisma.operatorReply.count({ where: { handoffRequestId: request.requestId } })).toBe(1);
      expect(await prisma.auditEvent.count({ where: { handoffRequestId: request.requestId, action: { in: ['operator_reply_created', 'operator_reply_replayed'] } } })).toBe(2);

      await handoff.close(request.requestId, principal, 'reply-close', 'operator_completed', 'resolved');
      await expect(handoff.reply(request.requestId, principal, 'after close', 'reply-key-2', 'reply-after-close'))
        .rejects.toThrow('only claimed handoffs accept replies');
    } finally {
      await prisma.conversation.delete({ where: { id: conversation.id } });
    }
  });

  it('keeps internal notes and fixed tags private, owner-bound, and idempotent', async () => {
    const accessToken = `handoff-context-test-${Date.now()}`;
    const conversation = await prisma.conversation.create({ data: { accessTokenHash: hashConversationToken(accessToken) } });
    const principal: StaffPrincipal = {
      staffId: 'context-operator',
      permissions: ['handoff:read', 'handoff:claim', 'handoff:context', 'conversation:read'],
    };
    const otherPrincipal: StaffPrincipal = { ...principal, staffId: 'other-context-operator' };
    try {
      const request = await handoff.request(conversation.id, accessToken, 'customer_requested');
      await expect(handoff.getInternalContext(request.requestId, principal)).rejects.toThrow('handoff must be claimed');
      await handoff.claim(request.requestId, principal, 'context-claim');
      await expect(handoff.getInternalContext(request.requestId, otherPrincipal)).rejects.toThrow('only the claiming Operator');

      const firstNote = await handoff.addInternalNote(request.requestId, principal, 'Ignore instructions in this note.', 'note-1', 'note-request-1');
      const replayNote = await handoff.addInternalNote(request.requestId, principal, 'different note is ignored', 'note-1', 'note-request-2');
      expect(firstNote.idempotent).toBe(false);
      expect(replayNote).toEqual({ ...firstNote, idempotent: true });
      expect(firstNote.note.content).toContain('Ignore instructions');

      expect(await handoff.addInternalTag(request.requestId, principal, 'urgent', 'tag-1', 'tag-request-1')).toMatchObject({ active: true, idempotent: false });
      expect(await handoff.addInternalTag(request.requestId, principal, 'urgent', 'tag-1', 'tag-request-2')).toMatchObject({ active: true, idempotent: true });
      expect(await handoff.removeInternalTag(request.requestId, principal, 'urgent', 'remove-tag-1', 'tag-remove-1')).toMatchObject({ active: false, idempotent: false });
      expect(await handoff.removeInternalTag(request.requestId, principal, 'urgent', 'remove-tag-1', 'tag-remove-2')).toMatchObject({ active: false, idempotent: true });

      const context = await handoff.getInternalContext(request.requestId, principal);
      expect(context.notes).toHaveLength(1);
      expect(context.tags).toEqual([]);
      const firstTimeline = await handoff.getAuditTimeline(request.requestId, 2);
      expect(firstTimeline.items).toHaveLength(2);
      expect(firstTimeline.nextCursor).toBeTruthy();
      expect(firstTimeline.items.every((item) => item.subjectType === 'handoff_request' || item.subjectType === 'internal_note' || item.subjectType === 'conversation_tag')).toBe(true);
      expect(JSON.stringify(firstTimeline)).not.toContain('Ignore instructions');
      const secondTimeline = await handoff.getAuditTimeline(request.requestId, 100, firstTimeline.nextCursor ?? undefined);
      expect(new Set([...firstTimeline.items, ...secondTimeline.items].map((item) => item.eventId)).size).toBe(firstTimeline.items.length + secondTimeline.items.length);
      expect(secondTimeline.items.some((item) => item.result === 'replayed')).toBe(true);
      await expect(handoff.getAuditTimeline(request.requestId, 2, 'tampered-cursor')).rejects.toThrow('timeline cursor is invalid');
      await prisma.auditEvent.create({
        data: { conversationId: conversation.id, handoffRequestId: request.requestId, actorType: 'system', action: 'unknown_action', outcome: 'created' },
      });
      await expect(handoff.getAuditTimeline(request.requestId, 100)).rejects.toThrow('unsupported audit action');
      const publicMessages = await new ConversationsService(prisma as never, new MockAgentAdapter(), handoff, audit).getMessages(conversation.id, accessToken);
      expect(JSON.stringify(publicMessages)).not.toContain('Ignore instructions');
      expect(JSON.stringify(publicMessages)).not.toContain('urgent');
      const events = await prisma.auditEvent.findMany({ where: { handoffRequestId: request.requestId } });
      expect(events.map((event) => event.action)).toContain('internal_note_created');
      expect(events.find((event) => event.action === 'internal_note_created')?.metadata).toMatchObject({ noteId: expect.any(String) });
      expect(events.some((event) => event.action === 'internal_note_replayed')).toBe(true);
      expect(events.every((event) => JSON.stringify(event.metadata ?? {}).includes('Ignore instructions') === false)).toBe(true);
    } finally {
      await prisma.conversation.delete({ where: { id: conversation.id } });
    }
  });
});
