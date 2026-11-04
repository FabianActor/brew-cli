import assert from 'node:assert/strict';
import test from 'node:test';

import { runCliSync } from './helpers/cli.mjs';

const hasSupabase = Boolean(process.env.BREW_GUIDE_SUPABASE_URL);

test(
  'brew-guide note list --format json outputs a JSON array',
  { skip: !hasSupabase },
  () => {
    const result = runCliSync(['note', 'list', '--format', 'json']);

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(Array.isArray(payload), true);
  },
);

test(
  'brew-guide note list --limit 3 returns at most three records',
  { skip: !hasSupabase },
  () => {
    const result = runCliSync(['note', 'list', '--limit', '3', '--format', 'json']);

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(Array.isArray(payload), true);
    assert.equal(payload.length <= 3, true);
  },
);

test('brew-guide note list rejects non-numeric --limit values', () => {
  const result = runCliSync(['note', 'list', '--limit', 'abc']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--limit/i);
});

test('brew-guide note list exits 64 when config is missing', () => {
  const result = runCliSync(['note', 'list'], {
    env: {
      BREW_GUIDE_SUPABASE_URL: '',
      BREW_GUIDE_SUPABASE_KEY: '',
      BREW_GUIDE_USER_ID: '',
      BREW_GUIDE_CONFIG_PATH: '/tmp/does-not-exist-config.json',
    },
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /Error: Config/i);
});
