import assert from 'node:assert/strict';
import test from 'node:test';

import { runCliSync } from './helpers/cli.mjs';

test('brew-guide note add --dry-run prints a preview without requiring Supabase', () => {
  const result = runCliSync([
    'note',
    'add',
    '--bean-id',
    'bean_123',
    '--method',
    'V60',
    '--score',
    '85',
    '--dry-run',
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[dry-run]/i);
  assert.match(result.stdout, /"beanId": "bean_123"/);
});

test('brew-guide note add --dry-run --format json outputs structured JSON', () => {
  const result = runCliSync([
    'note',
    'add',
    '--bean-id',
    'bean_123',
    '--method',
    'V60',
    '--dry-run',
    '--format',
    'json',
  ]);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.note.beanId, 'bean_123');
  assert.equal(payload.note.method, 'V60');
});

test('brew-guide note add --dry-run still succeeds when no credentials exist', () => {
  const result = runCliSync(
    [
      'note',
      'add',
      '--bean-id',
      'bean_123',
      '--method',
      'V60',
      '--dry-run',
    ],
    {
      env: {
        BREW_GUIDE_SUPABASE_URL: '',
        BREW_GUIDE_SUPABASE_KEY: '',
        BREW_GUIDE_USER_ID: '',
      },
    },
  );

  assert.equal(result.status, 0);
});

test('brew-guide note add keeps every field optional, like the app form', () => {
  // App 的冲煮记录允许不选豆子、不选手法（方法这一步可以跳过），所以 CLI 也不该有必填项。
  const result = runCliSync(['note', 'add', '--dry-run', '--format', 'json']);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.note.beanId, undefined);
  assert.equal(payload.note.method, undefined);
});

test('brew-guide note add validates --rating even without --method', () => {
  const result = runCliSync(['note', 'add', '--rating', '9', '--dry-run']);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /0 到 5/);
});

const hasSupabase = Boolean(process.env.BREW_GUIDE_SUPABASE_URL);

test(
  'brew-guide note add creates a note with required args when Supabase credentials are available',
  { skip: !hasSupabase },
  () => {
    const result = runCliSync([
      'note',
      'add',
      '--bean-id',
      'bean_test',
      '--method',
      'V60',
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Created note note_/i);
  },
);

test(
  'brew-guide note add creates a note with optional fields when Supabase credentials are available',
  { skip: !hasSupabase },
  () => {
    const result = runCliSync([
      'note',
      'add',
      '--bean-id',
      'bean_test',
      '--method',
      'Espresso',
      '--grind-size',
      '8.5',
      '--water-temp',
      '92',
      '--ratio',
      '1:2.5',
      '--score',
      '87',
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Created note note_/i);
  },
);

test(
  'brew-guide note add rejects payloads above 64 KB when Supabase credentials are available',
  { skip: !hasSupabase },
  () => {
    const result = runCliSync([
      'note',
      'add',
      '--bean-id',
      'bean_test',
      '--method',
      'V60',
      '--memo',
      'x'.repeat(70_000),
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /64 KB|limit/i);
  },
);
