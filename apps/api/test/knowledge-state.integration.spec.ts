import { PrismaClient } from '@prisma/client';
import { KnowledgeService } from '../src/modules/knowledge/knowledge.service.js';

const describeReal = process.env.RUN_REAL_DB_TESTS === '1' ? describe : describe.skip;
const sourceIds = ['TEST-MATRIX-STATUS', 'TEST-MATRIX-EXPIRED', 'TEST-MATRIX-CONFLICT'];

function markdown(input: {
  sourceId: string;
  version: string;
  status: string;
  sourceStatus?: string;
  expiresAt?: string;
  answer?: string;
}) {
  return `---
sourceId: ${input.sourceId}
sourceRef: test://knowledge-state-matrix
sourceStatus: ${input.sourceStatus ?? input.status}
title: Synthetic state matrix ${input.sourceId}
version: ${input.version}
status: ${input.status}
effectiveAt: 2026-01-01T00:00:00.000Z
expiresAt: ${input.expiresAt ?? ''}
approvedBy: test-only
approvedAt: 2026-01-01T00:00:00.000Z
publishedAt: 2026-01-01T00:00:00.000Z
---

## 1. Matrix question

### 问题

${input.sourceId} matrix question

### 答案

${input.answer ?? 'Synthetic answer for state matrix.'}

### 适用条件

- This is test-only synthetic data.

### 例外

- Escalate if identity cannot be confirmed.
`;
}

describeReal('knowledge state matrix', () => {
  const prisma = new PrismaClient();
  const service = new KnowledgeService(prisma as never);

  beforeAll(async () => {
    await prisma.knowledgeDocument.deleteMany({ where: { sourceId: { in: sourceIds } } });
  });

  afterAll(async () => {
    await prisma.knowledgeDocument.deleteMany({ where: { sourceId: { in: sourceIds } } });
    await prisma.$disconnect();
  });

  it('does not retrieve draft or local_eval versions and rejects candidate publication', async () => {
    await service.importMarkdown(markdown({ sourceId: sourceIds[0], version: 'v0.1.0-local', status: 'local_eval' }), 'local_eval');
    await service.importMarkdown(markdown({ sourceId: sourceIds[0], version: 'v0.2.0-draft', status: 'draft' }), 'draft');
    expect((await service.retrieve('TEST-MATRIX-STATUS matrix question')).chunks).toEqual([]);
    await expect(service.importMarkdown(markdown({ sourceId: sourceIds[0], version: 'v1.0.0-candidate', status: 'local_eval' }), 'published'))
      .rejects.toThrow(/sourceStatus=published/);
  });

  it('publishes a complete synthetic version and supersedes the previous version', async () => {
    const first = await service.importMarkdown(markdown({ sourceId: sourceIds[0], version: 'v1.0.0-test', status: 'published', answer: 'Synthetic answer version one.' }), 'published');
    expect((await service.retrieve('TEST-MATRIX-STATUS matrix question')).chunks).toHaveLength(1);
    const second = await service.importMarkdown(markdown({ sourceId: sourceIds[0], version: 'v1.1.0-test', status: 'published', answer: 'Synthetic answer version two.' }), 'published');
    expect((await prisma.knowledgeVersion.findUnique({ where: { id: first.id } }))?.status).toBe('superseded');
    const result = await service.retrieve('TEST-MATRIX-STATUS matrix question');
    expect(result.chunks[0].version).toBe('v1.1.0-test');
    expect(second.status).toBe('published');
  });

  it('excludes expired knowledge and fails closed on multiple active published versions', async () => {
    await service.importMarkdown(markdown({ sourceId: sourceIds[1], version: 'v1.0.0-expired', status: 'published', expiresAt: '2020-01-01T00:00:00.000Z', answer: 'ExpiredOnlySentinel.' }), 'published');
    expect((await service.retrieve('ExpiredOnlySentinel')).chunks).toEqual([]);
    await service.importMarkdown(markdown({ sourceId: sourceIds[2], version: 'v1.0.0-conflict', status: 'published', answer: 'Conflict-only answer.' }), 'published');
    await expect(service.retrieve('conflict-only answer')).rejects.toThrow(/Multiple published/);
  });
});
