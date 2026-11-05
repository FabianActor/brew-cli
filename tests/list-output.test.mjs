import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFields, plural, warn, warnMaybeMore } from '../src/lib/output.ts';

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
