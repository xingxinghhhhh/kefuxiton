import { runTracedN17Workflow } from '../src/traced-n17.js';
import { createTracedHumanReviewSession } from '../src/traced-n18.js';
import type { WorkflowPorts } from '../src/ports.js';

const ports: WorkflowPorts = {
  classifyUserRequest: () => 'handoff',
  retrievePublished: async () => ({ chunks: [], citations: [] }),
  containsUntrustedInstruction: () => false,
};

describe('N19 trace redaction boundary', () => {
  it('contains only structured safe fields and no input or interrupt payload', async () => {
    const rawInput = 'customer phone 13800000000 secret-token prompt payload';
    const n17 = await runTracedN17Workflow(rawInput, ports, 'redaction-n17');
    const n18 = await createTracedHumanReviewSession(ports).start(rawInput, 'redaction-n18');
    const serialized = JSON.stringify({ n17: n17.trace, n18: n18.trace });

    expect(serialized).not.toContain(rawInput);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('handoff_review_required');
    expect(serialized).not.toContain('__interrupt__');
    expect(serialized).not.toContain('13800000000');
    expect(n18.trace.events.every((event) => event.node === null || typeof event.node === 'string')).toBe(true);
  });
});
