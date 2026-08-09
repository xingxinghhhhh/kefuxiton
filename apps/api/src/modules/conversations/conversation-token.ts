import { createHash, randomBytes } from 'node:crypto';

export function createConversationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashConversationToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function extractBearerToken(authorization?: string) {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 && token.length <= 256 ? token : null;
}
