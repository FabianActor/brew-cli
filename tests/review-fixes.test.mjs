import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertBeanRecord } from '../src/tools/upsertBean.ts';
import { upsertNoteRecord } from '../src/tools/upsertNote.ts';

// 这两层是命令层唯一的写入入口：返回真实 id / timestamp，不再靠正则从文案里抠。
// （MCP 时代的 executeUpsertBean / executeUpsertNote 包装已删除，没有 server 在用它们。）

const config = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'publishable-key',
  brewGuideUserId: 'default_user',
};

function captureUpsert(table, expectedTable) {
  const state = { row: null, opts: null };
  const supabase = {
    from(name) {
      assert.equal(name, expectedTable ?? table);
      return {
        upsert(row, opts) {
          state.row = row;
          state.opts = opts;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { supabase, state };
}

test('upsertBeanRecord returns the generated id and timestamp', async () => {
  const { supabase, state } = captureUpsert('coffee_beans');

  const result = await upsertBeanRecord(supabase, config, {
    name: 'Ethiopia Yirgacheffe',
    origin: 'Ethiopia',
  });

  assert.match(result.id, /^bean_/);
  assert.equal(typeof result.timestamp, 'string');
  assert.deepEqual(state.opts, { onConflict: 'id,user_id' });
  assert.equal(state.row.user_id, 'default_user');
  assert.equal(state.row.data.name, 'Ethiopia Yirgacheffe');
  assert.equal(state.row.deleted_at, null);
});

test('upsertBeanRecord moves flat origin fields into blendComponents[0]', async () => {
  const { supabase, state } = captureUpsert('coffee_beans');

  await upsertBeanRecord(supabase, config, {
    name: '拼配',
    origin: '埃塞俄比亚',
    region: '古吉',
    process: '日晒',
  });

  const data = state.row.data;
  assert.deepEqual(data.blendComponents, [{ origin: '埃塞俄比亚', region: '古吉', process: '日晒' }]);
  assert.equal(data.origin, undefined);
  assert.equal(data.region, undefined);
});

test('upsertBeanRecord does not invent roast level or flavor period', async () => {
  const { supabase, state } = captureUpsert('coffee_beans');

  await upsertBeanRecord(supabase, config, { name: '只有名字' });

  const data = state.row.data;
  assert.equal(data.roastLevel, undefined);
  assert.equal(data.startDay, undefined);
  assert.equal(data.endDay, undefined);
  // 形状默认值仍要补上，App 读的时候不必自己兜底。
  assert.equal(data.beanType, 'filter');
  assert.equal(data.beanState, 'roasted');
  assert.equal(data.isFrozen, false);
  assert.equal(data.isInTransit, false);
});

test('upsertBeanRecord rejects data exceeding 64 KB', async () => {
  const { supabase } = captureUpsert('coffee_beans');

  await assert.rejects(
    () => upsertBeanRecord(supabase, config, { name: 'huge', notes: 'x'.repeat(70_000) }),
    /exceeds 64 KB limit/,
  );
});

test('upsertBeanRecord surfaces Supabase errors with a stable prefix', async () => {
  const supabase = {
    from() {
      return { upsert: async () => ({ error: { message: 'network down' } }) };
    },
  };

  await assert.rejects(
    () => upsertBeanRecord(supabase, config, { name: 'x' }),
    /Failed to upsert bean: network down/,
  );
});

test('upsertNoteRecord normalizes legacy flat fields', async () => {
  const { supabase, state } = captureUpsert('brewing_notes');

  const result = await upsertNoteRecord(supabase, config, {
    method: 'V60',
    score: 85,
    memo: '甜感好',
    waterTemp: 92,
    ratio: '1:15',
    grindSize: '中细',
  });

  assert.match(result.id, /^note_/);
  const data = state.row.data;
  assert.equal(data.rating, 4.3); // 85 / 20，保留一位小数
  assert.match(data.notes, /甜感好/);
  assert.equal(data.params.temp, '92°C');
  assert.equal(data.params.ratio, '1:15');
  assert.equal(data.params.grindSize, '中细');
  assert.equal(state.row.deleted_at, null);
});

test('upsertNoteRecord rejects data exceeding 64 KB', async () => {
  const { supabase } = captureUpsert('brewing_notes');

  await assert.rejects(
    () => upsertNoteRecord(supabase, config, { memo: 'x'.repeat(70_000) }),
    /exceeds 64 KB limit/,
  );
});
