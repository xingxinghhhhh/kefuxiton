import fs from 'node:fs';
import assert from 'node:assert/strict';

const route = fs.readFileSync(new URL('../app/chat/page.tsx', import.meta.url), 'utf8');
assert.match(route, /ChatShell/);
console.log('Web chat route smoke test passed.');
