import { MockAgentAdapter } from '../src/modules/agent/mock-agent.adapter.js';

describe('MockAgentAdapter', () => {
  it('returns a deterministic safe-unavailable response without citations', async () => {
    const adapter = new MockAgentAdapter();
    const first = await adapter.respond({ content: '退款什么时候到账？' });
    const second = await adapter.respond({ content: '退款什么时候到账？' });

    expect(first).toEqual(second);
    expect(first.agentMode).toBe('mock');
    expect(first.responseType).toBe('safe_unavailable');
    expect(first.citations).toEqual([]);
    expect(first.content).not.toContain('退款');
  });
});
