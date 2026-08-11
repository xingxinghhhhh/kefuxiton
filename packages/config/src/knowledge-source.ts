/**
 * Normalizes knowledge source text before hashing so line endings and trailing
 * whitespace cannot create two identities for the same fixture.
 */
export function normalizeKnowledgeMarkdown(markdown: string): string {
  return markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[ \t]+$/u, '')).join('\n').trim() + '\n';
}
