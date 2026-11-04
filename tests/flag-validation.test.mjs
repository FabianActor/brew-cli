import assert from 'node:assert/strict';
import test from 'node:test';

import { runCliSync } from './helpers/cli.mjs';

// 2026-11-04：citty 不校验未知 flag，四个 add/update 文件各自声明参数时，
// 没声明的 flag 会被静默吞掉（exit 0、字段没写进去）。这组用例钉住两层修复：
// ① bean update / note add 缺失的 flag 补上  ② 未知 flag 一律 exit 2。

const offline = {
  BREW_GUIDE_SUPABASE_URL: '',
  BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY: '',
  BREW_GUIDE_USER_ID: '',
};

test('bean update accepts --bean-type and --flavor', () => {
  const result = runCliSync([
    'bean', 'update', 'bean_x',
    '--bean-type', 'filter',
    '--flavor', '花香,莓果',
    '--dry-run', '--format', 'json',
  ], { env: offline });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.updates.beanType, 'filter');
  assert.deepEqual(payload.updates.flavor, ['花香', '莓果']);
});

test('note add accepts --coffee and --water and puts them under params', () => {
  const result = runCliSync([
    'note', 'add',
    '--bean-id', 'bean_x',
    '--method', 'V60',
    '--coffee', '15g',
    '--water', '225g',
    '--dry-run', '--format', 'json',
  ], { env: offline });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.note.params.coffee, '15g');
  assert.equal(payload.note.params.water, '225g');
});

test('note update accepts --coffee', () => {
  const result = runCliSync([
    'note', 'update', 'note_x',
    '--coffee', '15g',
    '--dry-run', '--format', 'json',
  ], { env: offline });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.updates.params.coffee, '15g');
});

for (const [command, argv] of [
  ['bean add', ['bean', 'add', '--name', 'X', '--roaster', 'R', '--component', 'origin=Peru;process=washed', '--bogus', '1', '--dry-run']],
  ['bean update', ['bean', 'update', 'bean_x', '--bogus', '1', '--dry-run']],
  ['note add', ['note', 'add', '--bean-id', 'bean_x', '--method', 'V60', '--bogus', '1', '--dry-run']],
  ['note update', ['note', 'update', 'note_x', '--bogus', '1', '--dry-run']],
]) {
  test(`${command} rejects unknown flags with exit 2`, () => {
    const result = runCliSync(argv, { env: offline });
    const output = `${result.stderr}${result.stdout}`;

    assert.equal(result.status, 2);
    assert.match(output, /不认识 --bogus/);
    assert.match(output, /可用参数：/);
  });
}
