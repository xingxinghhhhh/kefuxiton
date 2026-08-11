import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../components/chat/chat-shell.tsx', import.meta.url), 'utf8');
assert.match(source, /createConversation/);
assert.match(source, /sendMessage/);
assert.match(source, /submitMessageFeedback/);
assert.match(source, /有帮助/);
assert.match(source, /Mock Agent/);
assert.match(source, /disabled=\{!conversation \|\| !content\.trim\(\)/);
console.log('Web chat smoke test passed.');
