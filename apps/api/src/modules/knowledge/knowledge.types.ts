import type { Citation } from '@ai-agent/contracts';

export type KnowledgeStatus = 'draft' | 'published' | 'superseded' | 'expired' | 'local_eval';

export interface KnowledgeChunkInput {
  ordinal: number;
  heading: string;
  question: string;
  answer: string;
  conditions: string;
  exceptions: string;
  content: string;
  contentSha256: string;
  sourceLocator: string;
}

export interface ParsedKnowledgeDocument {
  sourceId: string;
  sourceRef: string | null;
  sourceStatus: string;
  title: string;
  version: string;
  status: KnowledgeStatus;
  effectiveAt: Date | null;
  expiresAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  rawContent: string;
  contentSha256: string;
  chunks: KnowledgeChunkInput[];
}

export interface RetrievedKnowledgeChunk {
  id: string;
  title: string;
  version: string;
  contentSha256: string;
  sourceLocator: string;
  heading: string;
  question: string;
  answer: string;
  conditions: string;
  exceptions: string;
  content: string;
  score: number;
}
