import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILTIN_EQUIPMENTS, findBuiltinEquipment } from '../src/lib/equipmentTypes.ts';
import { parseRating, parseStages, parseTemperature } from '../src/lib/noteInput.ts';
import {
  BEAN_TYPES,
  FLAVOR_PERIOD_PRESETS,
  ROAST_LEVELS,
  flavorPeriodForRoastLevel,
  normalizeRoastLevel,
} from '../src/lib/roast.ts';
import { runCliSync } from './helpers/cli.mjs';

// ── 烘焙度 ────────────────────────────────────────────────────────────────

test('normalizeRoastLevel 把 App 的缩写补全，标准值原样返回', () => {
  for (const [short, full] of [
    ['极浅', '极浅烘焙'],
    ['浅度', '浅度烘焙'],
    ['中浅', '中浅烘焙'],
    ['中度', '中度烘焙'],
    ['中深', '中深烘焙'],
    ['深度', '深度烘焙'],
  ]) {
    const result = normalizeRoastLevel(short);
    assert.equal(result.value, full);
    assert.equal(result.warning, undefined);
  }

  for (const level of ROAST_LEVELS) {
    assert.deepEqual(normalizeRoastLevel(level), { value: level });
  }
});

test('normalizeRoastLevel 对非标准值给出提醒但仍然照写', () => {
  const result = normalizeRoastLevel('City+');
  assert.equal(result.value, 'City+');
  assert.match(result.warning, /不是 App 的标准值/);
});

test('flavorPeriodForRoastLevel 与 App 的 PRESET_VALUES 一致（含「浅」取 light、含「深」取 dark）', () => {
  assert.deepEqual(flavorPeriodForRoastLevel('浅度烘焙'), { startDay: 7, endDay: 60 });
  assert.deepEqual(flavorPeriodForRoastLevel('极浅烘焙'), { startDay: 7, endDay: 60 });
  assert.deepEqual(flavorPeriodForRoastLevel('中度烘焙'), { startDay: 10, endDay: 60 });
  assert.deepEqual(flavorPeriodForRoastLevel('中深烘焙'), { startDay: 14, endDay: 90 });
  assert.deepEqual(flavorPeriodForRoastLevel('深度烘焙'), { startDay: 14, endDay: 90 });
  assert.deepEqual(flavorPeriodForRoastLevel(undefined), { startDay: 10, endDay: 60 });
  assert.deepEqual(flavorPeriodForRoastLevel(''), FLAVOR_PERIOD_PRESETS.medium);
});

test('BEAN_TYPES 覆盖 App 的三种豆种', () => {
  assert.deepEqual([...BEAN_TYPES], ['filter', 'espresso', 'omni']);
});

// ── 器具 ──────────────────────────────────────────────────────────────────

test('findBuiltinEquipment 认 id 与中文名，大小写不敏感', () => {
  assert.equal(findBuiltinEquipment('v60')?.id, 'V60');
  assert.equal(findBuiltinEquipment('V60')?.name, 'V60');
  assert.equal(findBuiltinEquipment('聪明杯')?.id, 'CleverDripper');
  assert.equal(findBuiltinEquipment('不存在的器具'), undefined);
  assert.equal(BUILTIN_EQUIPMENTS.length, 7);
});

// ── 冲煮记录输入 ──────────────────────────────────────────────────────────

test('parseRating 接受 0-5（含小数）', () => {
  assert.equal(parseRating('0'), 0);
  assert.equal(parseRating('4.5'), 4.5);
  assert.equal(parseRating('5'), 5);
});

test('parseTemperature 统一写成 °C', () => {
  assert.equal(parseTemperature('92'), '92°C');
  assert.equal(parseTemperature('92°C'), '92°C');
  assert.equal(parseTemperature(' 88 ℃ '), '88°C');
  assert.equal(parseTemperature('93.5C'), '93.5°C');
});

test('parseStages 兼容旧字段名并归一化类型', () => {
  const [stage] = parseStages('[{"name":"闷蒸","water":30,"time":15}]');
  assert.equal(stage.label, '闷蒸');
  assert.equal(stage.detail, '');
  assert.equal(stage.water, '30');
  assert.equal(stage.duration, 15);
});

test('parseStages 保留扩展字段', () => {
  const [stage] = parseStages(
    '[{"label":"绕圈注水","detail":"中心向外","water":"120g","duration":20,"pourType":"circle","valveStatus":"open"}]',
  );
  assert.deepEqual(stage, {
    label: '绕圈注水',
    detail: '中心向外',
    water: '120g',
    duration: 20,
    pourType: 'circle',
    valveStatus: 'open',
  });
});

// ── CLI 边界（会写坏数据的那几条） ─────────────────────────────────────────

test('bean add 不再猜烘焙度，默认不在途，赏味期按烘焙度取预设', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    '测试豆',
    '--roaster',
    'MAME',
    '--origin',
    '埃塞俄比亚',
    '--process',
    '水洗',
    '--roast-level',
    '浅度',
    '--dry-run',
    '--format',
    'json',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  const bean = payload.bean;
  assert.equal(bean.roastLevel, '浅度烘焙');
  assert.equal(bean.isInTransit, false);
  assert.equal(bean.startDay, 7);
  assert.equal(bean.endDay, 60);
});

test('bean add 不给烘焙度时 roastLevel 为空、赏味期按中烘', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    '测试豆',
    '--roaster',
    'MAME',
    '--origin',
    '埃塞俄比亚',
    '--process',
    '水洗',
    '--dry-run',
    '--format',
    'json',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const bean = JSON.parse(result.stdout).bean;
  assert.equal(bean.roastLevel, undefined);
  assert.equal(bean.startDay, 10);
  assert.equal(bean.endDay, 60);
});

test('bean add 拒绝未知豆种', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    '测试豆',
    '--roaster',
    'MAME',
    '--origin',
    '埃塞俄比亚',
    '--process',
    '水洗',
    '--bean-type',
    'coffee',
    '--dry-run',
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--bean-type must be one of filter, espresso, omni/);
});

test('note add 拒绝超出范围的评分', () => {
  const result = runCliSync(['note', 'add', '--bean-id', 'bean_x', '--method', 'V60', '--rating', '9']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--rating 必须在 0 到 5 之间/);
});

test('note add 拒绝带单位的坏水温', () => {
  const result = runCliSync([
    'note',
    'add',
    '--bean-id',
    'bean_x',
    '--method',
    'V60',
    '--water-temp',
    '热',
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--water-temp 只接受数字/);
});

test('method add 要求每个阶段有 label', () => {
  const result = runCliSync([
    'method',
    'add',
    '--equipment-id',
    'V60',
    '--name',
    '测试配方',
    '--stages-json',
    '[{"water":30}]',
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /缺少 label/);
});

test('equipment add 拒绝 App 不认识的动画类型', () => {
  const result = runCliSync([
    'equipment',
    'add',
    '--name',
    '测试器具',
    '--animation-type',
    'aeropress',
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--animation-type must be one of v60, kalita, origami, clever, custom, espresso/);
});
