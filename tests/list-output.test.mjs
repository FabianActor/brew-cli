import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFields, plural, printJson, shouldEscapeJson, toAsciiJson, warn, warnMaybeMore } from '../src/lib/output.ts';

test('formatFields keeps columns aligned when a value is missing', () => {
  const line = formatFields(['id-1', undefined, 'V60', 3.5, '']);
  assert.equal(line, 'id-1 | - | V60 | 3.5 | -');
  // 五列还是五列：不能因为中间有空值就把后面的值往前挤。
  assert.equal(line.split(' | ').length, 5);
});

test('formatFields prints numbers and booleans as-is', () => {
  assert.equal(formatFields([0, false, 12]), '0 | false | 12');
});

test('plural handles the singular case', () => {
  assert.equal(plural(1, 'stage'), '1 stage');
  assert.equal(plural(5, 'stage'), '5 stages');
  assert.equal(plural(2, 'equipment', 'equipment'), '2 equipment');
});

test('warnMaybeMore only speaks up when the limit was reached', () => {
  const messages = [];
  const original = console.error;
  console.error = (message) => messages.push(String(message));
  try {
    warnMaybeMore(3, 20);
    assert.deepEqual(messages, []);
    warnMaybeMore(20, 20);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /只显示前 20 条/);
  } finally {
    console.error = original;
  }
});

test('warn writes to stderr, not stdout', () => {
  const errors = [];
  const output = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (message) => errors.push(String(message));
  console.log = (message) => output.push(String(message));
  try {
    warn('提示');
    assert.deepEqual(errors, ['提示']);
    assert.deepEqual(output, []);
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
});

test('toAsciiJson turns non-ASCII into escapes that parse back to the same value', () => {
  const original = { origin: '埃塞俄比亚', note: '莓果 花香 ☕', count: 2, ok: true };
  const ascii = toAsciiJson(JSON.stringify(original));
  assert.match(ascii, /^[\x00-\x7f]*$/);
  assert.match(ascii, /\\u57c3/);
  assert.deepEqual(JSON.parse(ascii), original);
});

test('toAsciiJson leaves an already-ASCII payload byte-identical', () => {
  const text = JSON.stringify({ origin: 'Ethiopia', note: 'berry' });
  assert.equal(toAsciiJson(text), text);
});

test('shouldEscapeJson only escapes on Windows when output is not a terminal', () => {
  const empty = {};
  assert.equal(shouldEscapeJson('win32', false, empty), true);
  assert.equal(shouldEscapeJson('win32', true, empty), false);
  assert.equal(shouldEscapeJson('linux', false, empty), false);
  assert.equal(shouldEscapeJson('darwin', false, empty), false);
  // 逃生口：显式开关胜过平台判断。
  assert.equal(shouldEscapeJson('linux', false, { BREW_GUIDE_JSON_ASCII: '1' }), true);
  assert.equal(shouldEscapeJson('win32', false, { BREW_GUIDE_JSON_ASCII: '0' }), false);
});

test('printJson escapes Chinese when piped on Windows, keeps it readable in a terminal', () => {
  const lines = [];
  const originalLog = console.log;
  const originalASCII = process.env.BREW_GUIDE_JSON_ASCII;
  console.log = (message) => lines.push(String(message));
  try {
    delete process.env.BREW_GUIDE_JSON_ASCII;
    process.env.BREW_GUIDE_JSON_ASCII = '1';
    printJson({ origin: '埃塞俄比亚' });
    process.env.BREW_GUIDE_JSON_ASCII = '0';
    printJson({ origin: '埃塞俄比亚' });
  } finally {
    console.log = originalLog;
    if (originalASCII === undefined) delete process.env.BREW_GUIDE_JSON_ASCII;
    else process.env.BREW_GUIDE_JSON_ASCII = originalASCII;
  }
  assert.equal(lines[0], '{"origin":"\\u57c3\\u585e\\u4fc4\\u6bd4\\u4e9a"}');
  assert.equal(lines[1], '{"origin":"埃塞俄比亚"}');
  assert.deepEqual(JSON.parse(lines[0]), { origin: '埃塞俄比亚' });
});
