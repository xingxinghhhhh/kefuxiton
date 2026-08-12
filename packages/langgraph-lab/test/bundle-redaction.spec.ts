import { makeEvidenceBundle, makeEvidenceEnvelopes } from './bundle-fixtures.js';
import { verifyEvidenceBundle } from '../src/bundle-seal.js';

describe('N23 evidence bundle redaction', () => {
  it('rejects unknown and sensitive bundle fields without echoing values', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();
    const unknown = { ...bundle, unexpected: 'internal-value' };
    const sensitive = { ...bundle, operatorPrompt: 'top-secret-prompt' };
    const unknownResult = verifyEvidenceBundle(unknown, envelopes);
    const sensitiveResult = verifyEvidenceBundle(sensitive, envelopes);

    expect(unknownResult.reasonCode).toBe('BUNDLE_INVALID');
    expect(sensitiveResult.reasonCode).toBe('SENSITIVE_DATA_REJECTED');
    expect(JSON.stringify(unknownResult)).not.toContain('internal-value');
    expect(JSON.stringify(sensitiveResult)).not.toContain('top-secret-prompt');
  });

  it('maps sensitive envelope fields through the N22 verifier', () => {
    const bundle = makeEvidenceBundle();
    const envelopes = makeEvidenceEnvelopes();
    const sensitiveEnvelope = { ...envelopes[0], prompt: 'do-not-echo' };
    const result = verifyEvidenceBundle(bundle, [sensitiveEnvelope, ...envelopes.slice(1)]);

    expect(result.reasonCode).toBe('SENSITIVE_DATA_REJECTED');
    expect(JSON.stringify(result)).not.toContain('do-not-echo');
  });
});
