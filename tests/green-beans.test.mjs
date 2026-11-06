import assert from 'node:assert/strict';
import test from 'node:test';

import { runCliSync } from './helpers/cli.mjs';

// 生豆（beanState === 'green'）在 CLI 里整体关闭：所有相关请求都拒绝，且拒绝发生在任何
// 网络请求之前 —— 所以这些用例不需要配置、也不会碰库。
const REJECTION = /暂不支持生豆系列操作，请至 APP 查看并操作/;

test('bean add rejects --bean-state green', () => {
  const result = runCliSync(['bean', 'add', '--name', '测试生豆', '--bean-state', 'green']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, REJECTION);
});

test('bean add rejects --purchase-date (a green-bean-only field)', () => {
  const result = runCliSync(['bean', 'add', '--name', '测试', '--purchase-date', '2026-11-01']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, REJECTION);
});

test('bean update rejects --bean-state', () => {
  const result = runCliSync(['bean', 'update', 'bean_x', '--bean-state', 'green']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, REJECTION);
});

test('bean update rejects --purchase-date', () => {
  const result = runCliSync(['bean', 'update', 'bean_x', '--purchase-date', '2026-11-01']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, REJECTION);
});

test('bean add still works for roasted beans without touching green paths', () => {
  const result = runCliSync(
    ['bean', 'add', '--name', '普通熟豆', '--bean-state', 'roasted', '--dry-run', '--format', 'json'],
    // 指向不存在的配置：不读 App 里的赏味期设置，用例不联网（否则单条要 10 秒）。
    { env: { BREW_GUIDE_CONFIG_PATH: `${process.env.TEMP ?? '/tmp'}/brew-cli-no-such-config.json` } },
  );
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.bean.beanState, 'roasted');
});
