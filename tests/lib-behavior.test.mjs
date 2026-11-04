import test from 'node:test';
import assert from 'node:assert/strict';

import { listSummaries } from '../src/lib/query.ts';
import { pickSummaryFields } from '../src/lib/summary.ts';
import { normalizeWeight, parseGrams } from '../src/lib/weights.ts';
import { addEquipment } from '../src/services/equipment.ts';
import { fetchActiveRecords, upsertRecord } from '../src/services/base.ts';
import { resolveConfig } from '../src/config.ts';

/**
 * 极简 Supabase query builder 替身：支持 select / eq / ilike / is / order / limit / range / upsert / update。
 * 只实现 CLI 实际用到的链式调用，够验证分页、筛选下推与 compare-and-swap 写入。
 */
function createFakeSupabase({ rows = [], error = null } = {}) {
  const upserts = [];
  const ranges = [];
  const updates = [];

  function from(table) {
    const state = { table, filters: [], limit: null, range: null, patch: null };

    const matches = (row) => {
      for (const filter of state.filters) {
        if (filter.op === 'is') {
          const value = row[filter.column];
          if (filter.value === null && value !== null && value !== undefined) return false;
          if (filter.value !== null && value !== filter.value) return false;
          continue;
        }
        let actual;
        if (filter.column.startsWith('data->>')) {
          const key = filter.column.slice('data->>'.length);
          actual = row.data?.[key];
        } else {
          actual = row[filter.column];
        }
        if (filter.op === 'ilike') {
          const pattern = String(filter.value).replace(/%/g, '').toLowerCase();
          if (!String(actual ?? '').toLowerCase().includes(pattern)) return false;
          continue;
        }
        if (actual !== filter.value) return false;
      }
      return true;
    };

    const result = () => {
      if (state.patch) {
        const hits = rows.filter(matches);
        for (const row of hits) Object.assign(row, state.patch);
        updates.push({ table, patch: state.patch, matched: hits.length });
        return { data: hits.map((row) => ({ id: row.id })), error };
      }

      let hits = rows.filter(matches);
      if (state.range) {
        ranges.push(state.range);
        hits = hits.slice(state.range[0], state.range[1] + 1);
      }
      if (state.limit !== null) hits = hits.slice(0, state.limit);
      return { data: hits, error };
    };

    const api = {
      select: () => api,
      eq: (column, value) => {
        state.filters.push({ op: 'eq', column, value });
        return api;
      },
      ilike: (column, value) => {
        state.filters.push({ op: 'ilike', column, value });
        return api;
      },
      is: (column, value) => {
        state.filters.push({ op: 'is', column, value });
        return api;
      },
      order: () => api,
      limit: (n) => {
        state.limit = n;
        return api;
      },
      range: (fromIndex, toIndex) => {
        state.range = [fromIndex, toIndex];
        return api;
      },
      upsert: async (payload) => {
        upserts.push({ table, payload });
        return { error: null };
      },
      update: (patch) => {
        state.patch = patch;
        return api;
      },
      then: (onFulfilled, onRejected) => Promise.resolve(result()).then(onFulfilled, onRejected),
    };

    return api;
  }

  return { supabase: { from }, upserts, ranges, updates };
}

function makeRow(id, data) {
  return {
    id,
    data,
    user_id: 'default_user',
    updated_at: new Date(1700000000000).toISOString(),
    deleted_at: null,
  };
}

test('listSummaries pushes jsonb filters down and stops at --limit', async () => {
  const rows = [
    makeRow('bean_1', { name: 'A', roastLevel: '深度烘焙' }),
    makeRow('bean_2', { name: 'B', roastLevel: '浅度烘焙' }),
    makeRow('bean_3', { name: 'C', roastLevel: '深度烘焙' }),
  ];
  const { supabase } = createFakeSupabase({ rows });

  const { rows: result, truncated } = await listSummaries(supabase, {
    table: 'coffee_beans',
    userId: 'default_user',
    limit: 1,
    filters: [{ key: 'roastLevel', value: '深度烘焙' }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'bean_1');
  assert.equal(truncated, false);
});

test('listSummaries builds ilike filters for substring matches', async () => {
  const rows = [makeRow('note_1', { method: 'V60 一刀流' }), makeRow('note_2', { method: 'Espresso' })];
  const { supabase } = createFakeSupabase({ rows });

  const { rows: result } = await listSummaries(supabase, {
    table: 'brewing_notes',
    userId: 'default_user',
    limit: 10,
    filters: [{ key: 'method', op: 'ilike', value: '%v60%' }],
  });

  assert.deepEqual(
    result.map((row) => row.id),
    ['note_1'],
  );
});

test('listSummaries marks the result truncated when it hits maxScan', async () => {
  const rows = Array.from({ length: 10 }, (_, index) => makeRow(`bean_${index}`, { name: `B${index}` }));
  const { supabase } = createFakeSupabase({ rows });

  const { rows: result, scanned, truncated } = await listSummaries(supabase, {
    table: 'coffee_beans',
    userId: 'default_user',
    limit: 5,
    pageSize: 4,
    maxScan: 4,
    predicate: () => false,
  });

  assert.equal(result.length, 0);
  assert.equal(scanned, 4);
  assert.equal(truncated, true);
});

test('pickSummaryFields promotes blendComponents into the summary', () => {
  const summary = pickSummaryFields('coffee_beans', {
    name: 'TRIOON I 三重奏',
    blendComponents: [
      {
        region: '卡哈马卡',
        process: '水洗',
        variety: '卡杜拉',
        altitude: '1800m',
      },
      { region: '库斯科', process: '日晒', percentage: 40 },
    ],
  });

  assert.equal(summary.name, 'TRIOON I 三重奏');
  assert.equal(summary.region, '卡哈马卡');
  assert.equal(summary.process, '水洗');
  assert.equal(summary.altitude, '1800m');
  assert.equal(summary.componentCount, 2);
});

test('addEquipment refuses to overwrite an existing id without force', async () => {
  const existing = makeRow('V60', { name: 'Hario V60', hasValve: false, note: '原器具' });
  const { supabase, upserts } = createFakeSupabase({ rows: [existing] });

  await assert.rejects(
    () => addEquipment(supabase, 'V60 陶瓷', 'v60', true, '', 'default_user', 'V60'),
    /已存在/,
  );
  assert.equal(upserts.length, 0);
});

test('addEquipment overwrites an existing id when force is set', async () => {
  const existing = makeRow('V60', { name: 'Hario V60', hasValve: false, note: '原器具' });
  const { supabase, upserts, updates } = createFakeSupabase({ rows: [existing] });

  const saved = await addEquipment(supabase, 'V60 陶瓷', 'v60', true, '', 'default_user', 'V60', {
    force: true,
  });

  assert.equal(saved.id, 'V60');
  assert.equal(upserts.length, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.data.hasValve, true);
  assert.equal(typeof updates[0].patch.data.timestamp, 'number');
});

test('addEquipment --force keeps fields the CLI has no flag for', async () => {
  const existing = makeRow('custom-origami-1', {
    name: '冰瞳 B75',
    animationType: 'origami',
    customShapeSvg: '<svg/>',
    customValveSvg: '<svg valve/>',
    timestamp: 1780221171808,
  });
  const { supabase } = createFakeSupabase({ rows: [existing] });

  const saved = await addEquipment(
    supabase,
    '冰瞳 B75',
    'origami',
    false,
    '换了备注',
    'default_user',
    'custom-origami-1',
    { force: true },
  );

  assert.equal(saved.customShapeSvg, '<svg/>');
  assert.equal(saved.customValveSvg, '<svg valve/>');
  assert.equal(saved.timestamp, 1780221171808);
  assert.equal(saved.note, '换了备注');
});

test('upsertRecord refuses to write when updated_at moved after the read', async () => {
  const row = makeRow('bean_1', { name: '旧名字' });
  const readVersion = row.updated_at;
  const { supabase, updates } = createFakeSupabase({ rows: [row] });

  // 模拟 App 在这期间写过一次：库里的 updated_at 变了
  row.updated_at = new Date(1700000009000).toISOString();

  await assert.rejects(
    () => upsertRecord(supabase, 'coffee_beans', 'bean_1', { name: '新名字' }, 'default_user', readVersion),
    /被改过或删掉了/,
  );
  assert.equal(updates[0]?.matched, 0, '条件没命中：一个字段都没写');
  assert.equal(row.data.name, '旧名字');
});

test('upsertRecord writes when updated_at still matches the read version', async () => {
  const row = makeRow('bean_1', { name: '旧名字' });
  const { supabase, updates } = createFakeSupabase({ rows: [row] });

  await upsertRecord(supabase, 'coffee_beans', 'bean_1', { name: '新名字' }, 'default_user', row.updated_at);

  assert.equal(updates.length, 1);
  assert.equal(row.data.name, '新名字');
});

test('fetchActiveRecords pages through more rows than one request returns', async () => {
  const rows = Array.from({ length: 700 }, (_, index) => makeRow(`method-${index}`, { methods: [] }));
  const { supabase, ranges } = createFakeSupabase({ rows });

  const all = await fetchActiveRecords(supabase, 'custom_methods', 'default_user');

  assert.equal(all.length, 700);
  assert.deepEqual(ranges[0], [0, 499]);
  assert.deepEqual(ranges[1], [500, 999]);
});

test('addEquipment creates a row when the id is free', async () => {
  const { supabase, upserts } = createFakeSupabase({ rows: [] });

  const saved = await addEquipment(supabase, '蛋糕滤杯', 'cake', false, '', 'default_user');

  assert.match(String(saved.id), /^custom-/);
  assert.equal(upserts.length, 1);
});

test('normalizeWeight and parseGrams agree on the same values', () => {
  assert.equal(normalizeWeight('150g'), '150');
  assert.equal(normalizeWeight(' 120 克 '), '120');
  assert.equal(normalizeWeight(''), undefined);
  assert.equal(normalizeWeight(undefined), undefined);

  assert.equal(parseGrams('150g'), 150);
  assert.equal(parseGrams('120.5 克'), 120.5);
  assert.equal(parseGrams(undefined), 0);
});

test('resolveConfig strips trailing slashes from the Supabase URL', async () => {
  const originalEnv = { ...process.env };
  process.env.BREW_GUIDE_SUPABASE_URL = 'https://example.supabase.co//';
  process.env.BREW_GUIDE_SUPABASE_KEY = 'key';
  process.env.BREW_GUIDE_USER_ID = 'default_user';

  try {
    const config = await resolveConfig();
    assert.equal(config.supabaseUrl, 'https://example.supabase.co');
  } finally {
    process.env = originalEnv;
  }
});

