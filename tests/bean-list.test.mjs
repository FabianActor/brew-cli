import assert from 'node:assert/strict';
import test from 'node:test';

import { runCliSync } from './helpers/cli.mjs';

function getOfflineEnv() {
  return {
    BREW_GUIDE_SUPABASE_URL: '',
    BREW_GUIDE_SUPABASE_KEY: '',
    BREW_GUIDE_USER_ID: '',
  };
}

test('brew-guide bean list --limit rejects non-numeric values', () => {
  const result = runCliSync(['bean', 'list', '--limit', 'abc'], {
    env: getOfflineEnv(),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--limit/i);
});

test('brew-guide bean list exits with code 64 when config is missing', () => {
  const result = runCliSync(['bean', 'list'], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /Error: Config/i);
});

test('brew-guide bean list --format json returns an array', { skip: !process.env.BREW_GUIDE_SUPABASE_URL }, () => {
  const result = runCliSync(['bean', 'list', '--format', 'json']);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(Array.isArray(payload), true);
});

test('brew-guide bean list respects --limit', { skip: !process.env.BREW_GUIDE_SUPABASE_URL }, () => {
  const result = runCliSync(['bean', 'list', '--limit', '5', '--format', 'json']);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.length <= 5, true);
});
