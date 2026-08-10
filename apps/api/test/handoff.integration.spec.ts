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
      await expect(handoff.request(conversation.id, 'wrong-token', 'customer_requested')).rejects.toThrow('会话凭证无效');
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
});
