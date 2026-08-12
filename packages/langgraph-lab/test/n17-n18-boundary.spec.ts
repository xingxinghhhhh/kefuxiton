import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('N17 and N18 LangGraph boundary', () => {
  it('keeps N17 uncheckpointed while isolating N18 MemorySaver to the HITL graph', () => {
    const sourceDirectory = resolve(__dirname, '..', 'src');
    const n17Graph = readFileSync(resolve(sourceDirectory, 'graph.ts'), 'utf8');
    const n18Source = ['hitl-state.ts', 'hitl-graph.ts', 'hitl-resume.ts', 'hitl-result-mapper.ts']
      .map((file) => readFileSync(resolve(sourceDirectory, file), 'utf8'))
      .join('\n');

    expect(n17Graph).not.toMatch(/checkpointer/u);
    expect(n18Source).toMatch(/MemorySaver/u);
    expect(n18Source).toMatch(/interrupt/u);
    expect(n18Source).toMatch(/new Command\(\{ resume:/u);
    expect(n18Source).not.toMatch(/from ['"]@nestjs\//u);
    expect(n18Source).not.toMatch(/from ['"]@prisma\//u);
    expect(n18Source).not.toMatch(/from ['"].*agent\.port/u);
    expect(n18Source).not.toMatch(/from ['"](?:openai|@anthropic-ai|ollama|langsmith)\//u);
  });
});
