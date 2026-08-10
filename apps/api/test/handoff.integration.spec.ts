import { PrismaClient } from '@prisma/client';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { HandoffService } from '../src/modules/handoff/handoff.service.js';
import { ConversationsService } from '../src/modules/conversations/conversations.service.js';
import { MockAgentAdapter } from '../src/modules/agent/mock-agent.adapter.js';
import { hashConversationToken } from '../src/modules/conversations/conversation-token.js';

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
      expect(suppressed.responseType).toBe('handoff_requested');
      expect(suppressed.agentMode).toBe('handoff');
      expect(suppressed.handoffStatus).toBe('requested');
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
});
