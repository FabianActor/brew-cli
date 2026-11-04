import test from 'node:test';
import assert from 'node:assert/strict';

import { findUnknownFlags } from '../src/lib/args.ts';
import { BACKUP_TABLES } from '../src/commands/backup.ts';
import { consumeBean } from '../src/services/beans.ts';
import { listRoasters } from '../src/services/roasters.ts';
import { runCliSync } from './helpers/cli.mjs';

/** 覆盖 consumeBean 需要的 select/eq/is/limit 与 upsert。 */
function createFakeSupabase({ rows = [], upsertError = null, rpcData = null, rpcError = null } = {}) {
  const upserts = [];

  function from() {
    const state = { filters: [] };
    const matches = (row) =>
      state.filters.every(({ op, column, value }) => {
        const actual = row[column];
        if (op === 'is') {
          return value === null ? actual === null || actual === undefined : actual === value;
        }
        return actual === value;
      });

    const api = {
      select: () => api,
      eq: (column, value) => {
        state.filters.push({ op: 'eq', column, value });
        return api;
      },
      is: (column, value) => {
        state.filters.push({ op: 'is', column, value });
        return api;
      },
      limit: () => api,
      upsert: async (row) => {
        upserts.push(row);
        return { data: null, error: upsertError };
      },
      then: (resolve) => resolve({ data: rows.filter(matches), error: null }),
    };
    return api;
  }

  return {
    upserts,
    client: {
      from,
      rpc: async () => ({ data: rpcData, error: rpcError }),
    },
  };
}

test('consumeBean reports overdraw instead of silently clamping to zero', async () => {
  const { client, upserts } = createFakeSupabase({
    rows: [
      {
        id: 'bean-1',
        user_id: 'default_user',
        data: { name: 'Test Bean', remaining: '100' },
        updated_at: '2026-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ],
  });

  const result = await consumeBean(client, 'bean-1', 250, 'default_user');

  assert.ok(result);
  assert.equal(result.previousRemaining, 100);
  assert.equal(result.consumed, 100, '只能扣掉实际存在的量');
  assert.equal(result.bean.remaining, '0');
  assert.equal(result.overdrawn, true);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].data.remaining, '0');
});

test('consumeBean does not flag overdraw when the request fits in stock', async () => {
  const { client } = createFakeSupabase({
    rows: [
      {
        id: 'bean-2',
        user_id: 'default_user',
        data: { name: 'Test Bean', remaining: '100g' },
        updated_at: '2026-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ],
  });

  const result = await consumeBean(client, 'bean-2', 15, 'default_user');

  assert.ok(result);
  assert.equal(result.consumed, 15);
  assert.equal(result.bean.remaining, '85');
  assert.equal(result.overdrawn, false);
});

test('consumeBean returns null for a missing bean', async () => {
  const { client, upserts } = createFakeSupabase({ rows: [] });
  const result = await consumeBean(client, 'nope', 10, 'default_user');
  assert.equal(result, null);
  assert.equal(upserts.length, 0);
});

test('listRoasters maps the RPC payload to a plain string array', async () => {
  const { client } = createFakeSupabase({ rpcData: [{ roaster: 'A' }, { roaster: 'B' }, { roaster: 'A' }] });
  const names = await listRoasters(client);
  assert.deepEqual(names, ['A', 'B']);
});

test('listRoasters surfaces RPC failures as a prefixed error', async () => {
  const { client } = createFakeSupabase({ rpcError: { message: 'boom' } });
  await assert.rejects(() => listRoasters(client), /Failed to list roasters: boom/);
});

test('findUnknownFlags spots undeclared flags and ignores citty metadata', () => {
  const declared = { name: { type: 'string' }, 'dry-run': { type: 'boolean' } };

  assert.deepEqual(findUnknownFlags({ name: 'x', bogus: true }, declared), ['bogus']);
  assert.deepEqual(findUnknownFlags({ name: 'x', 'dry-run': true, _: [] }, declared), []);
  assert.deepEqual(findUnknownFlags({}, declared), []);
});

test('backup covers every table, and only soft-delete tables carry deleted_at', () => {
  const names = BACKUP_TABLES.map((table) => table.name);
  assert.deepEqual(names, [
    'coffee_beans',
    'brewing_notes',
    'custom_equipments',
    'custom_methods',
    'user_settings',
  ]);
  const settings = BACKUP_TABLES.find((table) => table.name === 'user_settings');
  assert.equal(settings.softDelete, false, 'user_settings 没有 deleted_at 列');
});

test('equipment add rejects an unknown flag with exit code 2', () => {
  const result = runCliSync(['equipment', 'add', '--name', 'V60', '--bogus'], {
    env: { BREW_GUIDE_CONFIG_PATH: '/tmp/does-not-exist-config.json' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /不认识 --bogus/);
});

test('method list rejects an unknown flag with exit code 2', () => {
  const result = runCliSync(['method', 'list', '--bogus'], {
    env: { BREW_GUIDE_CONFIG_PATH: '/tmp/does-not-exist-config.json' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /不认识 --bogus/);
});

test('note list rejects an invalid --from date with exit code 2', () => {
  const result = runCliSync(['note', 'list', '--from', '2026-13-45'], {
    env: { BREW_GUIDE_CONFIG_PATH: '/tmp/does-not-exist-config.json' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--from 不是有效日期/);
});
