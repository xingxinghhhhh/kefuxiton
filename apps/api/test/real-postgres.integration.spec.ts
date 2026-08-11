import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { KnowledgeService } from '../src/modules/knowledge/knowledge.service.js';

const describeReal = process.env.RUN_REAL_DB_TESTS === '1' ? describe : describe.skip;

const TEST_PUBLISHED_MARKDOWN = `---
sourceId: TEST-PUBLISHED-IT-DESK
sourceRef: test://synthetic-published-knowledge
sourceStatus: published
title: Synthetic published knowledge
version: v1.0.0-test
status: published
effectiveAt: 2026-01-01T00:00:00.000Z
expiresAt:
approvedBy: test-fixture-owner
approvedAt: 2026-01-01T00:00:00.000Z
publishedAt: 2026-01-01T00:00:00.000Z
---

## 1. Login access

### 问题

How can I access the office system?

### 答案

Use the approved access process and do not share credentials.

### 适用条件

- This is synthetic test data.

### 例外

- Escalate if identity cannot be confirmed.
`;

describeReal('real PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let conversationId: string;
  let secondConversationId: string;
  let knowledgeVersionId: string;

  async function createTestApp() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const testApp = moduleRef.createNestApplication(new ExpressAdapter());
    testApp.setGlobalPrefix('api/v1');
    testApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    testApp.useGlobalFilters(new HttpExceptionFilter());
    await testApp.init();
    return testApp;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    knowledgeVersionId = (await app.get(KnowledgeService).importMarkdown(TEST_PUBLISHED_MARKDOWN, 'published')).id;
  });

  afterAll(async () => {
    if (knowledgeVersionId) await prisma.knowledgeVersion.delete({ where: { id: knowledgeVersionId } });
    if (secondConversationId) await prisma.conversation.delete({ where: { id: secondConversationId } });
    if (conversationId) await prisma.conversation.delete({ where: { id: conversationId } });
    await app.close();
  });

  it('persists messages and rejects invalid conversation credentials', async () => {
    const created = await request(app.getHttpServer()).post('/api/v1/conversations').expect(201);
    conversationId = created.body.conversationId;
    const token = created.body.accessToken;
    const second = await request(app.getHttpServer()).post('/api/v1/conversations').expect(201);
    secondConversationId = second.body.conversationId;

    const sent = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'How can I access the office system?' })
      .expect(201);
    expect(sent.body.messages).toHaveLength(2);
    expect(sent.body.responseType).toBe('knowledge_answer');
    expect(sent.body.citations).toHaveLength(1);

    const history = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body.messages).toHaveLength(2);
    expect(history.body.messages.map((message: { senderType: string }) => message.senderType)).toEqual(['customer', 'ai']);

    const assistantMessageId = sent.body.assistantMessageId;
    const feedback = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages/${assistantMessageId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'helpful', idempotencyKey: 'feedback-real-1' })
      .expect(201);
    expect(feedback.body).toMatchObject({ conversationId, messageId: assistantMessageId, value: 'helpful', status: 'recorded', idempotent: false });
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages/${assistantMessageId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'helpful', idempotencyKey: 'feedback-real-1' })
      .expect(201)
      .then((response) => expect(response.body.status).toBe('replayed'));
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages/${assistantMessageId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'helpful', idempotencyKey: 'feedback-real-2' })
      .expect(201)
      .then((response) => expect(response.body.status).toBe('already_recorded'));
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages/${assistantMessageId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'not_helpful', idempotencyKey: 'feedback-real-3' })
      .expect(409)
      .then((response) => expect(response.body.error.code).toBe('FEEDBACK_CONFLICT'));
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages/${sent.body.messages[0].id}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'helpful', idempotencyKey: 'feedback-real-user' })
      .expect(403)
      .then((response) => expect(response.body.error.code).toBe('FEEDBACK_NOT_ALLOWED'));

    const historyWithFeedback = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(historyWithFeedback.body.messages.find((message: { id: string }) => message.id === assistantMessageId).feedback)
      .toMatchObject({ value: 'helpful' });
    const feedbackEvents = await prisma.auditEvent.findMany({ where: { conversationId, action: { startsWith: 'message_feedback_' } } });
    expect(feedbackEvents.length).toBe(4);
    expect(feedbackEvents.every((event) => JSON.stringify(event.metadata ?? {}).includes('How can I access'))).toBe(false);

    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${secondConversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', 'Bearer wrong-token')
      .send({ content: 'must fail' })
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${secondConversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'must not cross sessions' })
      .expect(401);

    expect(await prisma.message.count({ where: { conversationId } })).toBe(2);

    await app.close();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const afterRestart = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'How can I access the office system after restart?' })
      .expect(201);
    expect(afterRestart.body.responseType).toBe('knowledge_answer');
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages/${afterRestart.body.assistantMessageId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'not_helpful', idempotencyKey: 'feedback-real-1' })
      .expect(409)
      .then((response) => expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED'));
  });
});
