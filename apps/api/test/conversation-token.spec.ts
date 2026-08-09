import { createConversationToken, extractBearerToken, hashConversationToken } from '../src/modules/conversations/conversation-token.js';

describe('conversation token boundary', () => {
  it('creates a one-time token and only stores its hash', () => {
    const token = createConversationToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashConversationToken(token)).not.toBe(token);
    expect(hashConversationToken(token)).toHaveLength(64);
  });

  it('accepts only a bounded bearer token', () => {
    expect(extractBearerToken(`Bearer abc`)).toBe('abc');
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
  });
});
