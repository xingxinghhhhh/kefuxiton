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
  });
});
