import { runLangGraphResult } from '../src/graph.js';
import type { KnowledgeRetriever, WorkflowPorts } from '../src/ports.js';
import type { RetrievedKnowledgeChunk } from '../src/state.js';

const chunk: RetrievedKnowledgeChunk = {
  id: 'compatibility-chunk',
  title: 'Synthetic compatibility knowledge',
  version: 'v1.0.0-test-only',
  contentSha256: 'compatibility-sha256',
  sourceLocator: 'faq-compatibility',
  heading: 'Office access',
  question: 'office access',
  answer: 'Use the approved office access process.',
  conditions: 'Synthetic test only.',
  exceptions: 'None.',
  content: 'office access',
  score: 1,
};

const ports: WorkflowPorts = {
  classifyUserRequest: () => 'allow',
  retrievePublished: (question): ReturnType<KnowledgeRetriever> => Promise.resolve(question ? {
    chunks: [chunk],
    citations: [{
      id: chunk.id,
      title: chunk.title,
      uri: `knowledge://${chunk.id}`,
      version: chunk.version,
      locator: chunk.sourceLocator,
      contentSha256: chunk.contentSha256,
    }],
  } : { chunks: [], citations: [] }),
  containsUntrustedInstruction: () => false,
};

describe('LangGraph result compatibility', () => {
  it('does not add fields beyond the production AgentResult contract', async () => {
    const result = await runLangGraphResult('office access', ports);

    expect(Object.keys(result).sort()).toEqual([
      'agentMode',
      'citations',
      'content',
      'handoffRecommended',
      'responseType',
    ]);
  });
});
