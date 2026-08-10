import { Injectable } from '@nestjs/common';
import { KnowledgeVersionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { citationsFromChunks, parseKnowledgeMarkdown, retrieveDeterministically, validatePublishedDocument } from './markdown-knowledge.js';
import type { KnowledgeStatus, ParsedKnowledgeDocument, RetrievedKnowledgeChunk } from './knowledge.types.js';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async importMarkdown(markdown: string, requestedStatus?: KnowledgeStatus) {
    const parsed = parseKnowledgeMarkdown(markdown);
    const status = requestedStatus ?? parsed.status;
    const effectiveDocument: ParsedKnowledgeDocument = { ...parsed, status };
    if (status === 'published') validatePublishedDocument(effectiveDocument);
    if (status === 'published' && parsed.sourceStatus !== 'published') {
      throw new Error('Candidate or local_eval knowledge cannot be published');
    }

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.knowledgeDocument.upsert({
        where: { sourceId: parsed.sourceId },
        update: { title: parsed.title },
        create: { sourceId: parsed.sourceId, title: parsed.title },
      });
      if (status === 'published') {
        await tx.knowledgeVersion.updateMany({
          where: { documentId: document.id, status: KnowledgeVersionStatus.published },
          data: { status: KnowledgeVersionStatus.superseded },
        });
      }
      return tx.knowledgeVersion.create({
        data: {
          documentId: document.id,
          version: parsed.version,
          status: status as KnowledgeVersionStatus,
          sourceRef: parsed.sourceRef,
          sourceStatus: parsed.sourceStatus,
          contentSha256: parsed.contentSha256,
          effectiveAt: parsed.effectiveAt,
          expiresAt: parsed.expiresAt,
          approvedBy: parsed.approvedBy,
          approvedAt: parsed.approvedAt,
          publishedAt: status === 'published' ? parsed.publishedAt : null,
          rawContent: parsed.rawContent,
          chunks: { create: parsed.chunks.map((chunk) => ({ ...chunk })) },
        },
        select: { id: true, documentId: true, version: true, status: true, contentSha256: true },
      });
    });
  }

  async publishVersion(versionId: string) {
    const version = await this.prisma.knowledgeVersion.findUnique({
      where: { id: versionId },
      include: { document: true, chunks: true },
    });
    if (!version) throw new Error('Knowledge version not found');
    const parsed: ParsedKnowledgeDocument = {
      sourceId: version.document.sourceId,
      sourceRef: version.sourceRef,
      sourceStatus: version.sourceStatus ?? '',
      title: version.document.title,
      version: version.version,
      status: 'published',
      effectiveAt: version.effectiveAt,
      expiresAt: version.expiresAt,
      approvedBy: version.approvedBy,
      approvedAt: version.approvedAt,
      publishedAt: new Date(),
      rawContent: version.rawContent,
      contentSha256: version.contentSha256 ?? '',
      chunks: version.chunks.map((chunk) => ({
        ordinal: chunk.ordinal,
        heading: chunk.heading,
        question: chunk.question,
        answer: chunk.answer,
        conditions: chunk.conditions,
        exceptions: chunk.exceptions,
        content: chunk.content,
        contentSha256: chunk.contentSha256,
        sourceLocator: chunk.sourceLocator,
      })),
    };
    validatePublishedDocument(parsed);
    return this.prisma.$transaction(async (tx) => {
      await tx.knowledgeVersion.updateMany({
        where: { documentId: version.documentId, status: KnowledgeVersionStatus.published, id: { not: versionId } },
        data: { status: KnowledgeVersionStatus.superseded },
      });
      return tx.knowledgeVersion.update({
        where: { id: versionId },
        data: { status: KnowledgeVersionStatus.published, publishedAt: parsed.publishedAt },
      });
    });
  }

  async retrieve(question: string) {
    const versions = await this.prisma.knowledgeVersion.findMany({
      where: { status: KnowledgeVersionStatus.published },
      include: { document: true, chunks: { orderBy: { ordinal: 'asc' } } },
    });
    const now = Date.now();
    const active = versions.filter((version) =>
      (!version.effectiveAt || version.effectiveAt.getTime() <= now) && (!version.expiresAt || version.expiresAt.getTime() > now));
    if (active.length > 1) throw new Error('Multiple published knowledge versions are active');
    if (active.length === 0) return { chunks: [], citations: [] };
    const version = active[0];
    const candidates: RetrievedKnowledgeChunk[] = version.chunks.map((chunk) => ({
      id: chunk.id,
      title: version.document.title,
      version: version.version,
      contentSha256: chunk.contentSha256,
      sourceLocator: chunk.sourceLocator,
      heading: chunk.heading,
      question: chunk.question,
      answer: chunk.answer,
      conditions: chunk.conditions,
      exceptions: chunk.exceptions,
      content: chunk.content,
      score: 0,
    }));
    const chunks = retrieveDeterministically(question, candidates);
    return { chunks, citations: citationsFromChunks(chunks) };
  }
}
