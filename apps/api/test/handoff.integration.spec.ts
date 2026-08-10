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
      const conversations = new ConversationsService(prisma as never, agent, handoff);
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

      const close = await handoff.close(request.requestId, principal, 'integration-close');
      expect(close).toEqual({ requestId: request.requestId, status: 'closed', idempotent: false });
      expect(await handoff.close(request.requestId, principal, 'integration-close-replay')).toEqual({
        requestId: request.requestId,
        status: 'closed',
        idempotent: true,
      });
      expect((await handoff.getStatus(conversation.id, accessToken))?.status).toBe('closed');

      const conversations = new ConversationsService(prisma as never, new MockAgentAdapter(), handoff);
      const suppressed = await conversations.sendMessage(conversation.id, accessToken, 'closed status message');
      expect(suppressed.responseType).toBe('handoff_pending');
      expect(suppressed.messages).toHaveLength(1);
      expect(suppressed.handoffRecommended).toBe(false);
      expect(await prisma.auditEvent.count({ where: { handoffRequestId: request.requestId } })).toBe(5);
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
      const conversations = new ConversationsService(prisma as never, new MockAgentAdapter(), handoff);
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
      expect(history.messages.at(-1)).toMatchObject({ content: '人工回复内容', senderType: 'human_operator' });
      expect(await prisma.operatorReply.count({ where: { handoffRequestId: request.requestId } })).toBe(1);
      expect(await prisma.auditEvent.count({ where: { handoffRequestId: request.requestId, action: { in: ['operator_reply_created', 'operator_reply_replayed'] } } })).toBe(2);

      await handoff.close(request.requestId, principal, 'reply-close');
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
      const publicMessages = await new ConversationsService(prisma as never, new MockAgentAdapter(), handoff).getMessages(conversation.id, accessToken);
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
