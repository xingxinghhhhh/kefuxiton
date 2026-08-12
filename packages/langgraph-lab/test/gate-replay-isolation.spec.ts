import { buildEvidenceGateSnapshot } from '../src/gate-snapshot.js';
import { createN26ReplayInput } from './gate-replay-inputs.js';

describe('N26 replay input isolation', () => {
  it('does not mutate bundle or envelope inputs across repeated replay', () => {
    const input = createN26ReplayInput('valid');
    const bundleBefore = structuredClone(input.bundle);
    const envelopesBefore = structuredClone(input.envelopes);

    buildEvidenceGateSnapshot(input.bundle, input.envelopes);
    buildEvidenceGateSnapshot(input.bundle, input.envelopes);

    expect(input.bundle).toEqual(bundleBefore);
    expect(input.envelopes).toEqual(envelopesBefore);
  });

  it('keeps all replay scenarios in memory without runtime identifiers', () => {
    for (const scenarioId of ['valid', 'sensitive_or_unknown_field', 'malformed_or_empty'] as const) {
      const input = createN26ReplayInput(scenarioId);
      const snapshot = buildEvidenceGateSnapshot(input.bundle, input.envelopes);
      const serializedSnapshot = JSON.stringify(snapshot);
      expect(serializedSnapshot).not.toContain('thread');
      expect(serializedSnapshot).not.toContain('trace');
      expect(serializedSnapshot).not.toContain('Token');
      expect(serializedSnapshot).not.toContain('prompt');
    }
  });
});
