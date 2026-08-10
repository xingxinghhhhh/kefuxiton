import { createHash } from 'node:crypto';
import type { Citation } from '@ai-agent/contracts';
import type { KnowledgeChunkInput, KnowledgeStatus, ParsedKnowledgeDocument, RetrievedKnowledgeChunk } from './knowledge.types.js';

const MAX_CHUNK_LENGTH = 1200;
const MIN_RETRIEVAL_SCORE = 0.2;
const REQUIRED_SECTIONS = ['问题', '答案', '适用条件', '例外'] as const;
const ENGLISH_STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'for', 'how', 'i', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'what', 'where', 'with']);

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeDocument(markdown: string) {
  return markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[ \t]+$/u, '')).join('\n').trim() + '\n';
}

function parseMetadata(markdown: string) {
  const lines = markdown.split('\n');
  if (lines[0] !== '---') throw new Error('Knowledge Markdown must start with front matter');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('Knowledge Markdown front matter is not closed');
  const metadata = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const match = /^(?<key>[A-Za-z][A-Za-z0-9]*)\s*:\s*(?<value>.*)$/u.exec(line);
    if (match?.groups) metadata.set(match.groups.key, match.groups.value.trim());
  }
  return { metadata, body: lines.slice(end + 1).join('\n').trim() };
}

function required(metadata: Map<string, string>, key: string) {
  const value = metadata.get(key)?.trim();
  if (!value) throw new Error(`Knowledge Markdown metadata is missing: ${key}`);
  return value;
}

function optional(metadata: Map<string, string>, key: string) {
  const value = metadata.get(key)?.trim();
  return value || null;
}

function parseStatus(value: string): KnowledgeStatus {
  if (!['draft', 'published', 'superseded', 'expired', 'local_eval'].includes(value)) {
    throw new Error(`Unsupported knowledge status: ${value}`);
  }
  return value as KnowledgeStatus;
}

function parseDate(value: string | null, key: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Knowledge Markdown metadata is not a date: ${key}`);
  return parsed;
}

function sectionText(sections: Map<string, string>, name: string) {
  return sections.get(name)?.trim() ?? '';
}

function splitIntoChunks(block: {
  heading: string;
  question: string;
  answer: string;
  conditions: string;
  exceptions: string;
  content: string;
}, ordinal: number): KnowledgeChunkInput[] {
  const chunks: KnowledgeChunkInput[] = [];
  for (let offset = 0; offset < block.content.length; offset += MAX_CHUNK_LENGTH) {
    const content = block.content.slice(offset, offset + MAX_CHUNK_LENGTH);
    const isFirst = offset === 0;
    chunks.push({
      ordinal: ordinal + chunks.length,
      heading: block.heading,
      question: isFirst ? block.question : '',
      answer: isFirst ? block.answer : '',
      conditions: isFirst ? block.conditions : '',
      exceptions: isFirst ? block.exceptions : '',
      content,
      contentSha256: sha256(content),
      sourceLocator: `faq-${ordinal + chunks.length + 1}`,
    });
  }
  return chunks;
}

function parseFaqBlocks(body: string) {
  const lines = body.split('\n');
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^##\s+\d+\.\s+.+$/u.test(lines[index])) starts.push(index);
  }
  if (starts.length === 0) throw new Error('Knowledge Markdown must contain at least one numbered FAQ heading');
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    const blockLines = lines.slice(start, end);
    const heading = blockLines[0].replace(/^##\s+\d+\.\s+/u, '').trim();
    const sections = new Map<string, string>();
    let current: string | null = null;
    for (const line of blockLines.slice(1)) {
      const section = /^###\s+(.+)$/u.exec(line)?.[1]?.trim();
      if (section) {
        current = section;
        sections.set(current, '');
      } else if (current) {
        sections.set(current, `${sections.get(current) ?? ''}${line}\n`);
      }
    }
    for (const requiredSection of REQUIRED_SECTIONS) {
      if (!sectionText(sections, requiredSection)) throw new Error(`FAQ is missing section: ${requiredSection}`);
    }
    return {
      heading,
      question: sectionText(sections, '问题'),
      answer: sectionText(sections, '答案'),
      conditions: sectionText(sections, '适用条件'),
      exceptions: sectionText(sections, '例外'),
      content: blockLines.join('\n').trim(),
    };
  });
}

export function parseKnowledgeMarkdown(markdown: string): ParsedKnowledgeDocument {
  const normalized = normalizeDocument(markdown);
  const { metadata, body } = parseMetadata(normalized);
  const status = parseStatus(required(metadata, 'status'));
  const chunks = parseFaqBlocks(body).flatMap((block, index) => splitIntoChunks(block, index));
  return {
    sourceId: required(metadata, 'sourceId'),
    sourceRef: optional(metadata, 'sourceRef'),
    sourceStatus: required(metadata, 'sourceStatus'),
    title: required(metadata, 'title'),
    version: required(metadata, 'version'),
    status,
    effectiveAt: parseDate(optional(metadata, 'effectiveAt'), 'effectiveAt'),
    expiresAt: parseDate(optional(metadata, 'expiresAt'), 'expiresAt'),
    approvedBy: optional(metadata, 'approvedBy'),
    approvedAt: parseDate(optional(metadata, 'approvedAt'), 'approvedAt'),
    publishedAt: parseDate(optional(metadata, 'publishedAt'), 'publishedAt'),
    rawContent: normalized,
    contentSha256: sha256(normalized),
    chunks,
  };
}

export function validatePublishedDocument(document: ParsedKnowledgeDocument) {
  const missing: string[] = [];
  if (document.status !== 'published') missing.push('status=published');
  if (document.sourceStatus !== 'published') missing.push('sourceStatus=published');
  if (!document.sourceRef) missing.push('sourceRef');
  if (!document.effectiveAt) missing.push('effectiveAt');
  if (!document.approvedBy) missing.push('approvedBy');
  if (!document.approvedAt) missing.push('approvedAt');
  if (!document.publishedAt) missing.push('publishedAt');
  if (missing.length > 0) throw new Error(`Published knowledge metadata is incomplete: ${missing.join(', ')}`);
}

export function tokenize(value: string) {
  const normalized = value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
  const tokens = new Set<string>((normalized.match(/[a-z0-9]+/gu) ?? []).filter((token) => !ENGLISH_STOP_WORDS.has(token)));
  const characters = Array.from(normalized);
  for (let index = 0; index < characters.length - 1; index += 1) {
    if (/^[\u4e00-\u9fff]$/u.test(characters[index]) && /^[\u4e00-\u9fff]$/u.test(characters[index + 1])) {
      tokens.add(`${characters[index]}${characters[index + 1]}`);
    }
  }
  return [...tokens];
}

export function retrieveDeterministically(question: string, chunks: RetrievedKnowledgeChunk[]) {
  const queryTokens = tokenize(question);
  if (queryTokens.length === 0) return [];
  return chunks.map((chunk) => {
    const chunkTokens = new Set(tokenize(`${chunk.question} ${chunk.answer} ${chunk.conditions} ${chunk.exceptions}`));
    const matched = queryTokens.filter((token) => chunkTokens.has(token));
    return { ...chunk, score: matched.length / queryTokens.length, matchedCount: matched.length };
  }).filter((chunk) => chunk.score >= MIN_RETRIEVAL_SCORE)
    .sort((left, right) => right.score - left.score || right.matchedCount - left.matchedCount || left.sourceLocator.localeCompare(right.sourceLocator))
    .slice(0, 3)
    .map(({ matchedCount: _matchedCount, ...chunk }) => chunk);
}

export function citationsFromChunks(chunks: RetrievedKnowledgeChunk[]): Citation[] {
  return chunks.map((chunk) => ({
    id: chunk.id,
    title: chunk.title,
    uri: `knowledge://${chunk.id}`,
    version: chunk.version,
    locator: chunk.sourceLocator,
    contentSha256: chunk.contentSha256,
  }));
}

export const KNOWLEDGE_CHUNK_LENGTH = MAX_CHUNK_LENGTH;
export const KNOWLEDGE_RETRIEVAL_THRESHOLD = MIN_RETRIEVAL_SCORE;
