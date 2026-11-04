import assert from 'node:assert/strict';
import test from 'node:test';

import { isMissingFunctionError, MissingRoastersFunctionError, roastersFunctionGuide } from '../src/lib/roastersSql.ts';
import { listRoasters } from '../src/services/roasters.ts';
import { runCliSync } from './helpers/cli.mjs';

const hasSupabase = Boolean(process.env.BREW_GUIDE_SUPABASE_URL);

test(
  'brew-guide roasters --format json outputs an array of strings',
  { skip: !hasSupabase },
  () => {
    const result = runCliSync(['roasters', '--format', 'json']);

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(Array.isArray(payload), true);
    assert.equal(payload.every((entry) => typeof entry === 'string'), true);
  },
);

test(
  'brew-guide roasters prints roasters or an empty-state message when Supabase credentials are available',
  { skip: !hasSupabase },
  () => {
    const result = runCliSync(['roasters']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /.+/s);
  },
);

test('brew-guide roasters exits 64 when config is missing', () => {
  const result = runCliSync(['roasters'], {
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

test('listRoasters turns PGRST202 into MissingRoastersFunctionError', async () => {
  const supabase = {
    rpc: async () => ({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.get_all_roasters without parameters in the schema cache',
      },
    }),
  };

  await assert.rejects(() => listRoasters(supabase), MissingRoastersFunctionError);
});

test('listRoasters keeps the plain network error when the RPC exists but fails', async () => {
  const supabase = {
    rpc: async () => ({ data: null, error: { code: '57014', message: 'canceling statement' } }),
  };

  await assert.rejects(
    () => listRoasters(supabase),
    (error) => error instanceof Error && !(error instanceof MissingRoastersFunctionError) && /^Failed to list roasters: /i.test(error.message),
  );
});

test('isMissingFunctionError recognises both the code and the message form', () => {
  assert.equal(isMissingFunctionError({ code: 'PGRST202' }), true);
  assert.equal(isMissingFunctionError({ message: 'Could not find the function public.x' }), true);
  assert.equal(isMissingFunctionError({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isMissingFunctionError(null), false);
});

test('roastersFunctionGuide carries the SQL and a runnable instruction', () => {
  const guide = roastersFunctionGuide();
  assert.match(guide, /create or replace function public\.get_all_roasters\(\)/);
  assert.match(guide, /SQL Editor/);
});
