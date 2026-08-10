import { UnauthorizedException } from '@nestjs/common';
import { MockAgentAdapter } from '../src/modules/agent/mock-agent.adapter.js';
import { ConversationsService } from '../src/modules/conversations/conversations.service.js';
import { hashConversationToken } from '../src/modules/conversations/conversation-token.js';

describe('conversation persistence and isolation', () => {
  it('persists a user/agent pair and rejects a credential on another conversation', async () => {
    const conversationId = '00000000-0000-0000-0000-000000000001';
    const storedHash = hashConversationToken('valid-token');
    const messages: Array<Record<string, unknown>> = [];
    const fakePrisma = {
      conversation: {
        create: jest.fn(async () => ({
          id: conversationId,
          status: 'active',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        })),
        findFirst: jest.fn(async ({ where }: { where: { id: string; accessTokenHash: string } }) =>
          where.id === conversationId && where.accessTokenHash === storedHash ? { id: conversationId } : null),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          conversation: {
            findFirst: jest.fn(async () => ({ id: conversationId, status: 'active' })),
          },
          message: {
            create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
              const message = {
                id: `message-${messages.length + 1}`,
                responseType: null,
                agentMode: null,
                citations: null,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                ...data,
              };
              messages.push(message);
              return message;
            }),
          },
        }),
      ),
    };
    const service = new ConversationsService(
      fakePrisma as never,
      new MockAgentAdapter(),
      { getActiveRequest: jest.fn(async () => null) } as never,
    );

    const result = await service.sendMessage(conversationId, 'valid-token', 'hello');
    expect(result.messages).toHaveLength(2);
    expect(messages.map((message) => message.role)).toEqual(['user', 'agent']);
    expect(result.responseType).toBe('safe_unavailable');

    await expect(service.sendMessage('00000000-0000-0000-0000-000000000002', 'valid-token', 'hello'))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
