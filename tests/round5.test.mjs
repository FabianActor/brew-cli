import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { flavorTierForRoastLevel } from '../src/lib/roast.ts';
import { normalizePeriodDay, resolveFlavorPeriod } from '../src/lib/flavorPeriod.ts';
import { fetchFlavorPeriodSettings } from '../src/services/settings.ts';
import { runCliSync } from './helpers/cli.mjs';

const ORIGIN_FLAGS = ['--origin', '埃塞俄比亚', '--process', '水洗'];
const BASE = ['bean', 'add', '--name', '测试豆', '--roaster', 'MAME', ...ORIGIN_FLAGS];

// ── 纯函数 ────────────────────────────────────────────────────────────────

test('flavorTierForRoastLevel 只看「浅」「深」两个字', () => {
  assert.equal(flavorTierForRoastLevel('浅度烘焙'), 'light');
  assert.equal(flavorTierForRoastLevel('极浅烘焙'), 'light');
  assert.equal(flavorTierForRoastLevel('深度烘焙'), 'dark');
  assert.equal(flavorTierForRoastLevel('中度烘焙'), 'medium');
  assert.equal(flavorTierForRoastLevel(undefined), 'medium');
});

test('normalizePeriodDay 只认正数', () => {
  assert.equal(normalizePeriodDay(7), 7);
  assert.equal(normalizePeriodDay('12'), 12);
  assert.equal(normalizePeriodDay(0), 0);
  assert.equal(normalizePeriodDay(-3), 0);
  assert.equal(normalizePeriodDay('abc'), 0);
  assert.equal(normalizePeriodDay(undefined), 0);
});

test('resolveFlavorPeriod 没有设置时用兜底预设', () => {
  assert.deepEqual(resolveFlavorPeriod('浅度烘焙', 'MAME'), {
    startDay: 7,
    endDay: 60,
    source: 'preset',
  });
  assert.deepEqual(resolveFlavorPeriod('深度烘焙', undefined), {
    startDay: 14,
    endDay: 90,
    source: 'preset',
  });
});

test('resolveFlavorPeriod 用全局自定义，未设的字段回落预设', () => {
  const settings = { customFlavorPeriod: { light: { startDay: 5, endDay: 0 } } };
  assert.deepEqual(resolveFlavorPeriod('浅度烘焙', undefined, settings), {
    startDay: 5,
    endDay: 60,
    source: 'custom',
  });
});

test('resolveFlavorPeriod 烘焙商配置优先于全局自定义', () => {
  const settings = {
    customFlavorPeriod: { medium: { startDay: 12, endDay: 70 } },
    roasterConfigs: [
      { roasterName: '明谦', flavorPeriod: { medium: { startDay: 4, endDay: 45 } } },
    ],
  };
  assert.deepEqual(resolveFlavorPeriod('中度烘焙', '明谦', settings), {
    startDay: 4,
    endDay: 45,
    source: 'roaster',
  });
});

test('resolveFlavorPeriod 烘焙商配置为 0 时不算设置，继续往下回落', () => {
  const settings = {
    customFlavorPeriod: { dark: { startDay: 20, endDay: 120 } },
    roasterConfigs: [{ roasterName: '明谦', flavorPeriod: { dark: { startDay: 0, endDay: 0 } } }],
  };
  assert.deepEqual(resolveFlavorPeriod('深度烘焙', '明谦', settings), {
    startDay: 20,
    endDay: 120,
    source: 'custom',
  });
});

test('resolveFlavorPeriod 不查「未知烘焙商」和空名字', () => {
  const settings = {
    roasterConfigs: [{ roasterName: '未知烘焙商', flavorPeriod: { light: { startDay: 1, endDay: 2 } } }],
  };
  assert.deepEqual(resolveFlavorPeriod('浅度烘焙', '未知烘焙商', settings), {
    startDay: 7,
    endDay: 60,
    source: 'preset',
  });
  assert.deepEqual(resolveFlavorPeriod('浅度烘焙', '   ', settings), {
    startDay: 7,
    endDay: 60,
    source: 'preset',
  });
});

// ── 读 user_settings ──────────────────────────────────────────────────────

function fakeSettingsClient(result) {
  return {
    from(table) {
      assert.equal(table, 'user_settings');
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return Promise.resolve(result);
        },
      };
    },
  };
}

test('fetchFlavorPeriodSettings 从 data.appSettings 取两份设置', async () => {
  const client = fakeSettingsClient({
    data: [
      {
        data: {
          appSettings: {
            customFlavorPeriod: { light: { startDay: 5, endDay: 55 } },
            roasterConfigs: [
              {
                roasterName: '明谦',
                logoData: 'data:image/webp;base64,xxxx',
                updatedAt: 1,
                flavorPeriod: { medium: { startDay: 3, endDay: 40 } },
              },
              { roasterName: '', flavorPeriod: { light: { startDay: 1, endDay: 2 } } },
            ],
          },
        },
      },
    ],
    error: null,
  });

  const settings = await fetchFlavorPeriodSettings(client, 'default_user');
  assert.deepEqual(settings.customFlavorPeriod, { light: { startDay: 5, endDay: 55 } });
  assert.equal(settings.roasterConfigs.length, 1);
  assert.equal(settings.roasterConfigs[0].roasterName, '明谦');
  assert.deepEqual(settings.roasterConfigs[0].flavorPeriod, { medium: { startDay: 3, endDay: 40 } });
});

test('fetchFlavorPeriodSettings 遇到没设置过返回空对象', async () => {
  assert.deepEqual(await fetchFlavorPeriodSettings(fakeSettingsClient({ data: [], error: null })), {});
  assert.deepEqual(
    await fetchFlavorPeriodSettings(fakeSettingsClient({ data: [{ data: {} }], error: null })),
    {},
  );
});

test('fetchFlavorPeriodSettings 读失败时报错，调用方才知道要不要提示', async () => {
  await assert.rejects(
    () => fetchFlavorPeriodSettings(fakeSettingsClient({ data: null, error: { message: 'boom' } })),
    /Failed to fetch user settings: boom/,
  );
});

// ── 命令层：读不到设置就回落预设 ──────────────────────────────────────────

function withBrokenConfig(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brew-flavor-'));
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      supabaseUrl: 'https://127.0.0.1:9',
      supabaseKey: 'test-key',
      brewGuideUserId: 'default_user',
    }),
    'utf8',
  );
  try {
    return fn({ BREW_GUIDE_CONFIG_PATH: configPath });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('读不到赏味期设置时，bean add 仍然用兜底预设', () => {
  withBrokenConfig((env) => {
    const result = runCliSync(
      [...BASE, '--roast-level', '浅度烘焙', '--dry-run', '--format', 'json'],
      { env },
    );
    assert.equal(result.status, 0, result.stderr);
    const bean = JSON.parse(result.stdout).bean;
    assert.equal(bean.startDay, 7);
    assert.equal(bean.endDay, 60);
  });
});

test('给了 --start-day 就不必读设置', () => {
  withBrokenConfig((env) => {
    const result = runCliSync(
      [...BASE, '--roast-level', '浅度烘焙', '--start-day', '3', '--dry-run', '--format', 'json'],
      { env },
    );
    assert.equal(result.status, 0, result.stderr);
    const bean = JSON.parse(result.stdout).bean;
    assert.equal(bean.startDay, 3);
    assert.equal(bean.endDay, 60);
  });
});
