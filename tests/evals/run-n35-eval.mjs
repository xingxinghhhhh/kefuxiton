import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const smokePath = join(root, 'tests', 'smoke', 'n35-synthetic-knowledge-modes.mjs');
const evalCases = JSON.parse(readFileSync(join(root, 'tests/evals/n35-synthetic-knowledge-modes.json'), 'utf8'));

function assert(condition) {
  if (!condition) throw new Error('assertion failed');
}

function safeCase(caseId, passed) {
  if (passed) console.log(JSON.stringify({ caseId, status: 'passed', reasonCode: 'NONE' }));
  else {
    console.log(JSON.stringify({ caseId, status: 'failed', reasonCode: 'N35_EVAL_FAILED' }));
    process.exitCode = 1;
  }
}

try {
  assert(Array.isArray(evalCases) && evalCases.length === 18);
  assert(new Set(evalCases.map((testCase) => testCase.id)).size === 18);
  const result = spawnSync(process.execPath, ['--no-warnings', smokePath], {
    cwd: root,
    encoding: 'utf8',
    timeout: 360_000,
    windowsHide: true,
    env: { ...process.env },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert(result.status === 0);
  assert(!/postgres(?:ql)?:\/\/|(?:[A-Z]:\\|[A-Z]:\/(?!\/))|node_modules|node:internal|stack trace/iu.test(output));
  const passedCases = new Set(`${result.stdout ?? ''}`.split(/\r?\n/u).flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event.status === 'passed' && typeof event.caseId === 'string' ? [event.caseId] : [];
    } catch {
      return [];
    }
  }));
  for (const testCase of evalCases) safeCase(testCase.id, passedCases.has(testCase.id));
  if (process.exitCode) process.exit(1);
} catch {
  console.log(JSON.stringify({ caseId: 'N35-BOOTSTRAP', status: 'failed', reasonCode: 'N35_EVAL_FAILED' }));
  process.exitCode = 1;
}
