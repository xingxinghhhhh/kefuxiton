import { createHumanReviewSession } from '../src/hitl-resume.js';
import type { KnowledgeRetriever, WorkflowPorts } from '../src/ports.js';

function makePorts(): WorkflowPorts {
  const emptyRetriever: KnowledgeRetriever = async () => ({ chunks: [], citations: [] });
  return {
    classifyUserRequest: () => 'handoff',
    retrievePublished: emptyRetriever,
    containsUntrustedInstruction: () => false,
  };
}

describe('N18 human-review resume validation', () => {
  it('maps deny to safe unavailable without changing the shared AgentResult contract', async () => {
    const session = createHumanReviewSession(makePorts());
    await session.start('synthetic high-risk request', 'n18-resume-deny');

    const resumed = await session.resume('n18-resume-deny', { decision: 'deny_handoff', decisionVersion: 1 });

    expect(resumed).toMatchObject({
      runStatus: 'completed',
      resumeStatus: 'denied',
      terminalOutcome: 'safe_refusal',
      result: {
        responseType: 'safe_unavailable',
        handoffRecommended: false,
        citations: [],
      },
    });
  });

  it('fails closed for missing and structurally invalid decisions', async () => {
    const missingSession = createHumanReviewSession(makePorts());
    await missingSession.start('synthetic high-risk request', 'n18-resume-missing');
    const missing = await missingSession.resume('n18-resume-missing', null);

    const invalidSession = createHumanReviewSession(makePorts());
    await invalidSession.start('synthetic high-risk request', 'n18-resume-invalid');
    const invalid = await invalidSession.resume('n18-resume-invalid', {
      decision: 'approve_handoff',
      decisionVersion: 1,
      extra: 'not allowed',
    });

    expect(missing).toMatchObject({ runStatus: 'rejected', resumeStatus: 'invalid', errorCode: 'HUMAN_DECISION_MISSING' });
    expect(missing.result).toMatchObject({ responseType: 'safe_unavailable', handoffRecommended: false });
    expect(invalid).toMatchObject({ runStatus: 'rejected', resumeStatus: 'invalid', errorCode: 'HUMAN_DECISION_INVALID' });
    expect(invalid.result).toMatchObject({ responseType: 'safe_unavailable', handoffRecommended: false });
  });

  it('maps completed and unknown threads to duplicate and stale without rerunning the graph', async () => {
    const session = createHumanReviewSession(makePorts());
    await session.start('synthetic high-risk request', 'n18-resume-duplicate');
    await session.resume('n18-resume-duplicate', { decision: 'approve_handoff', decisionVersion: 1 });

    const duplicate = await session.resume('n18-resume-duplicate', { decision: 'approve_handoff', decisionVersion: 1 });
    const stale = await session.resume('n18-resume-unknown', { decision: 'approve_handoff', decisionVersion: 1 });

    expect(duplicate).toMatchObject({ runStatus: 'rejected', resumeStatus: 'approved', errorCode: 'HUMAN_RESUME_DUPLICATE' });
    expect(stale).toMatchObject({ runStatus: 'rejected', resumeStatus: 'stale', errorCode: 'HUMAN_RESUME_STALE' });
    expect(duplicate.result).toBeNull();
    expect(stale.result).toBeNull();
  });

  it('returns safe unavailable for no published match and mock fallback for retrieval failure', async () => {
    const noMatch = await createHumanReviewSession({
      ...makePorts(),
      classifyUserRequest: () => 'allow',
    }).start('synthetic no match', 'n18-resume-no-match');
    const failurePorts: WorkflowPorts = {
      ...makePorts(),
      classifyUserRequest: () => 'allow',
      retrievePublished: async () => {
        throw new Error('synthetic retrieval failure');
      },
    };
    const failure = await createHumanReviewSession(failurePorts).start('synthetic retrieval failure', 'n18-resume-failure');

    expect(noMatch.result?.responseType).toBe('safe_unavailable');
    expect(failure.result?.responseType).toBe('mock_fallback');
  });
});
