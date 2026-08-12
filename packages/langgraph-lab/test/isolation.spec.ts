import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('LangGraph lab isolation', () => {
  it('keeps the compiled experiment source free of production framework and provider imports', () => {
    const sourceDirectory = resolve(__dirname, '..', 'src');
    const source = ['graph.ts', 'nodes.ts', 'ports.ts', 'result-mapper.ts', 'state.ts']
      .map((file) => readFileSync(resolve(sourceDirectory, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/from ['"]@nestjs\//u);
    expect(source).not.toMatch(/from ['"]@prisma\//u);
    expect(source).not.toMatch(/from ['"].*agent\.port/u);
  });
});
