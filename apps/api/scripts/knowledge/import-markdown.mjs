import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { KnowledgeService } from '../../dist/modules/knowledge/knowledge.service.js';

const filePath = resolve(process.argv[2] ?? 'src/modules/knowledge/fixtures/it-service-desk.local-eval.md');
const requestedStatus = process.argv.find((argument) => argument.startsWith('--status='))?.slice('--status='.length) ?? 'local_eval';
if (requestedStatus === 'published' && process.env.ALLOW_KNOWLEDGE_PUBLISH !== '1') {
  throw new Error('Publishing knowledge requires ALLOW_KNOWLEDGE_PUBLISH=1 and complete approved metadata');
}
if (!['draft', 'published', 'superseded', 'expired', 'local_eval'].includes(requestedStatus)) {
  throw new Error(`Unsupported requested status: ${requestedStatus}`);
}

const prisma = new PrismaClient();
try {
  const service = new KnowledgeService(prisma);
  const result = await service.importMarkdown(await readFile(filePath, 'utf8'), requestedStatus);
  console.log(`knowledge imported: ${result.id} ${result.version} ${result.status} ${result.contentSha256}`);
} finally {
  await prisma.$disconnect();
}
