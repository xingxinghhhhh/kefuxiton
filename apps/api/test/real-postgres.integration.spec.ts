import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const describeReal = process.env.RUN_REAL_DB_TESTS === '1' ? describe : describe.skip;

describeReal('real PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let conversationId: string;
  let secondConversationId: string;

  async function createTestApp() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const testApp = moduleRef.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    testApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    testApp.useGlobalFilters(new HttpExceptionFilter());
    await testApp.init();
    return testApp;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
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
      .send({ content: 'hello from postgres' })
      .expect(201);
    expect(sent.body.messages).toHaveLength(2);

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
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'after restart' })
      .expect(201);
  });
});
