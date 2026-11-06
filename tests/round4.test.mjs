import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseDateOnly, parsePrice, resolveTransitFlags, todayLocalDate } from '../src/lib/beanInput.ts';
import { resolveConfig } from '../src/config.ts';
import { runCliSync } from './helpers/cli.mjs';

const ORIGIN_FLAGS = ['--origin', '埃塞俄比亚', '--process', '水洗'];
const BASE = ['bean', 'add', '--name', '测试豆', '--roaster', 'MAME', ...ORIGIN_FLAGS];

function addJson(extra) {
  const result = runCliSync([...BASE, ...extra, '--dry-run', '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).bean;
}

// ── 纯函数 ────────────────────────────────────────────────────────────────

test('parsePrice 容错 ¥ / 元，并把 88 这种整数原样留下', () => {
  assert.equal(parsePrice('88'), '88');
  assert.equal(parsePrice('88.5'), '88.5');
  assert.equal(parsePrice(' ¥88.5 '), '88.5');
  assert.equal(parsePrice('88元'), '88');
});

test('todayLocalDate 输出本地时区的 YYYY-MM-DD', () => {
  assert.equal(todayLocalDate(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  assert.equal(todayLocalDate(new Date(2026, 11, 31, 0, 5)), '2026-12-31');
});

test('parseDateOnly 只接受 YYYY-MM-DD', () => {
  assert.equal(parseDateOnly('2026-11-04', '--roast-date'), '2026-11-04');
});

test('resolveTransitFlags 开一个就关另一个', () => {
  assert.deepEqual(resolveTransitFlags(true, undefined), { isInTransit: true, isFrozen: false });
  assert.deepEqual(resolveTransitFlags(undefined, true), { isFrozen: true, isInTransit: false });
  assert.deepEqual(resolveTransitFlags(false, undefined), { isInTransit: false });
  assert.deepEqual(resolveTransitFlags(undefined, undefined), {});
});

// ── 在途 / 冷冻 ───────────────────────────────────────────────────────────

test('bean add --in-transit 写 isInTransit:true 且不动冷冻', () => {
  const bean = addJson(['--in-transit']);
  assert.equal(bean.isInTransit, true);
  assert.equal(bean.isFrozen, false);
});

test('bean add --is-frozen 写 isFrozen:true 且把在途关掉', () => {
  const bean = addJson(['--is-frozen']);
  assert.equal(bean.isFrozen, true);
  assert.equal(bean.isInTransit, false);
});

test('bean add 同时给 --in-transit 和 --is-frozen 直接报错', () => {
  const result = runCliSync([...BASE, '--in-transit', '--is-frozen', '--dry-run']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /互斥/);
});

// ── 生豆（CLI 整体关闭，见 tests/green-beans.test.mjs）────────────────────

test('bean add 拒绝生豆（旧行为：记购买日期、不写赏味期）', () => {
  const result = runCliSync([...BASE, '--bean-state', 'green', '--dry-run']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /暂不支持生豆系列操作/);
});

test('bean add 拒绝不认识的 --bean-state', () => {
  const result = runCliSync([...BASE, '--bean-state', 'frozen', '--dry-run']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--bean-state 只能是 roasted 或 green/);
});

// ── 价格 ──────────────────────────────────────────────────────────────────

test('bean add 把 ¥88.5 规整成 88.5', () => {
  assert.equal(addJson(['--price', '¥88.5']).price, '88.5');
});

test('bean add 拒绝非数字和三位的价格', () => {
  for (const bad of ['abc', '88.555']) {
    const result = runCliSync([...BASE, '--price', bad, '--dry-run']);
    assert.equal(result.status, 2, `--price ${bad} 应该被拒绝`);
    assert.match(result.stderr, /只接受数字/);
  }

  // 负数得写成 --price=-5，否则会被当成一个 flag（citty 的行为），两条路都该失败。
  for (const args of [['--price', '-5'], ['--price=-5']]) {
    const result = runCliSync([...BASE, ...args, '--dry-run']);
    assert.equal(result.status, 2, `--price ${args.join(' ')} 应该被拒绝`);
  }
});

// ── bean update ───────────────────────────────────────────────────────────

function updateJson(extra) {
  const result = runCliSync(['bean', 'update', 'bean_test', ...extra, '--dry-run', '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).updates;
}

test('bean update --no-in-transit 取消在途', () => {
  assert.equal(updateJson(['--no-in-transit']).isInTransit, false);
});

test('bean update --is-frozen 同时把在途关掉', () => {
  const updates = updateJson(['--is-frozen']);
  assert.equal(updates.isFrozen, true);
  assert.equal(updates.isInTransit, false);
});

test('bean update 拒绝生豆相关参数（旧行为：转生豆清烘焙日期与赏味期）', () => {
  const result = runCliSync(['bean', 'update', 'bean_test', '--bean-state', 'green', '--dry-run']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /暂不支持生豆系列操作/);
});

test('bean update 的 --price 同样校验', () => {
  assert.equal(updateJson(['--price', '88元']).price, '88');
  const bad = runCliSync(['bean', 'update', 'bean_test', '--price', 'abc', '--dry-run']);
  assert.equal(bad.status, 2);
});

// ── dotenv ────────────────────────────────────────────────────────────────

test('resolveConfig 不读当前目录的 .env（只认配置文件和 shell 环境变量）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brew-config-'));
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      supabaseUrl: 'https://real-project.supabase.co',
      supabaseKey: 'from-config-file',
      brewGuideUserId: 'default_user',
    }),
  );
  // 当前目录摆一份「危险」的 .env：以前 dotenv: true 会把它读进来，改掉这里连的库。
  fs.writeFileSync(path.join(dir, '.env'), 'BREW_GUIDE_SUPABASE_URL=https://evil.example.com\n');

  const previousCwd = process.cwd();
  const previousConfigPath = process.env.BREW_GUIDE_CONFIG_PATH;
  const previousUrl = process.env.BREW_GUIDE_SUPABASE_URL;
  delete process.env.BREW_GUIDE_SUPABASE_URL;
  process.env.BREW_GUIDE_CONFIG_PATH = configPath;
  process.chdir(dir);
  try {
    const config = await resolveConfig();
    assert.equal(config.supabaseUrl, 'https://real-project.supabase.co');
    assert.equal(config.supabaseKey, 'from-config-file');
  } finally {
    process.chdir(previousCwd);
    if (previousConfigPath === undefined) delete process.env.BREW_GUIDE_CONFIG_PATH;
    else process.env.BREW_GUIDE_CONFIG_PATH = previousConfigPath;
    if (previousUrl !== undefined) process.env.BREW_GUIDE_SUPABASE_URL = previousUrl;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
