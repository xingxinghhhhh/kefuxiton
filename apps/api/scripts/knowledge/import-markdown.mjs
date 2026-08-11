import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  BusinessInputPackageValidationError,
  BusinessReadinessError,
  assertProductionReadiness,
  canonicalizeBusinessInputPackage,
  evaluateBusinessReadiness,
  isKnowledgePublishAllowed,
  loadBusinessInputPackage,
} from '@ai-agent/config';
import { KnowledgeService } from '../../dist/modules/knowledge/knowledge.service.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
function resolveRepositoryPath(candidate, base = repositoryRoot) {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(base, candidate);
  const relativePath = relative(repositoryRoot, absolute);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('Business readiness path must remain inside the repository');
  return absolute;
}

const filePath = resolve(process.argv[2] ?? 'src/modules/knowledge/fixtures/it-service-desk.local-eval.md');
const requestedStatus = process.argv.find((argument) => argument.startsWith('--status='))?.slice('--status='.length) ?? 'local_eval';
const readinessManifestPath = process.argv.find((argument) => argument.startsWith('--readiness-manifest='))?.slice('--readiness-manifest='.length);
const requestedReadinessTarget = process.argv.find((argument) => argument.startsWith('--readiness-target='))?.slice('--readiness-target='.length);
if (requestedStatus === 'published' && !isKnowledgePublishAllowed(process.env)) {
  throw new Error('Publishing knowledge requires ALLOW_KNOWLEDGE_PUBLISH=1 and complete approved metadata');
}
if (!['draft', 'published', 'superseded', 'expired', 'local_eval'].includes(requestedStatus)) {
  throw new Error(`Unsupported requested status: ${requestedStatus}`);
}
if (requestedStatus === 'published') {
  if (!readinessManifestPath) throw new Error('Publishing knowledge requires a business readiness manifest');
  const readinessTarget = process.env.APP_ENV === 'production' ? 'production' : (requestedReadinessTarget ?? 'local_eval');
  if (!['local_eval', 'production'].includes(readinessTarget)) throw new Error('Invalid business readiness target');
  const manifestFilePath = resolveRepositoryPath(readinessManifestPath, process.cwd());
  const manifest = JSON.parse(await readFile(manifestFilePath, 'utf8'));
  let packageInput;
  try {
    packageInput = loadBusinessInputPackage(manifest);
  } catch (error) {
    const reasonCodes = error instanceof BusinessInputPackageValidationError ? error.reasonCodes.join(',') : 'INVALID_FIELD';
    throw new Error(`Business readiness rejected: ${reasonCodes}`);
  }
  const canonicalSha256 = createHash('sha256').update(canonicalizeBusinessInputPackage(packageInput), 'utf8').digest('hex');
  const sourceContentSha256 = packageInput.knowledgeSource.sourceFile
    ? createHash('sha256').update(await readFile(resolveRepositoryPath(packageInput.knowledgeSource.sourceFile), 'utf8'), 'utf8').digest('hex')
    : undefined;
  const report = evaluateBusinessReadiness(packageInput, readinessTarget, { canonicalSha256, sourceContentSha256 });
  if (readinessTarget === 'production') {
    try {
      assertProductionReadiness(report);
    } catch (error) {
      if (error instanceof BusinessReadinessError) throw new Error(`Business readiness rejected: ${error.report.reasonCodes.join(',')}`);
      throw error;
    }
  } else if (report.status === 'NOT_READY') {
    throw new Error(`Business readiness rejected: ${report.reasonCodes.join(',')}`);
  }
}

const prisma = new PrismaClient();
try {
  const service = new KnowledgeService(prisma);
  const result = await service.importMarkdown(await readFile(filePath, 'utf8'), requestedStatus);
  console.log(`knowledge imported: ${result.id} ${result.version} ${result.status} ${result.contentSha256}`);
} finally {
  await prisma.$disconnect();
}
