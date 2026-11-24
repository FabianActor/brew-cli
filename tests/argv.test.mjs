import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeArgv } from '../src/lib/argv.ts';
import { runCliSync } from './helpers/cli.mjs';

test('roasters 省略子命令时补成 list', () => {
  assert.deepEqual(normalizeArgv(['roasters']), ['roasters', 'list']);
  assert.deepEqual(normalizeArgv(['roasters', '--format', 'json']), ['roasters', 'list', '--format', 'json']);
  assert.deepEqual(normalizeArgv(['roasters', '--format=json']), ['roasters', 'list', '--format=json']);
});

test('显式写了子命令、help 或拼错的子命令都原样走', () => {
  assert.deepEqual(normalizeArgv(['roasters', 'list', '--format', 'json']), ['roasters', 'list', '--format', 'json']);
  assert.deepEqual(normalizeArgv(['roasters', 'logo']), ['roasters', 'logo']);
  assert.deepEqual(normalizeArgv(['roasters', '--help']), ['roasters', '--help']);
  assert.deepEqual(normalizeArgv(['roasters', 'bogus']), ['roasters', 'bogus']);
});

test('其它命令完全不受影响', () => {
  assert.deepEqual(normalizeArgv(['bean', 'list', '--limit', '2']), ['bean', 'list', '--limit', '2']);
  assert.deepEqual(normalizeArgv([]), []);
});

test('roasters --format json 不再被当成子命令（缺配置时是 exit 64，不是 Unknown command）', () => {
  const result = runCliSync(['roasters', '--format', 'json'], {
    env: {
      BREW_GUIDE_SUPABASE_URL: '',
      BREW_GUIDE_SUPABASE_KEY: '',
      BREW_GUIDE_USER_ID: '',
      BREW_GUIDE_CONFIG_PATH: '/tmp/does-not-exist-config.json',
    },
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /Error: Config/i);
  assert.doesNotMatch(result.stderr, /Unknown command/i);
});
