import assert from 'node:assert/strict';
import test from 'node:test';

import { runCliSync } from './helpers/cli.mjs';

function getOfflineEnv() {
  return {
    BREW_GUIDE_SUPABASE_URL: '',
    BREW_GUIDE_SUPABASE_KEY: '',
    BREW_GUIDE_USER_ID: '',
  };
}

test('brew-guide bean add --dry-run prints a preview without credentials', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'X',
    '--roaster',
    'R',
    '--origin',
    'O',
    '--process',
    'P',
    '--dry-run',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[dry-run\]/i);
  assert.match(result.stdout, /"name": "X"/);
  assert.match(result.stdout, /"roaster": "R"/);
});

test('brew-guide bean add --dry-run --format json returns a structured preview', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'X',
    '--roaster',
    'R',
    '--origin',
    'O',
    '--process',
    'P',
    '--dry-run',
    '--format',
    'json',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.bean.name, 'X');
  assert.equal(payload.bean.beanType, 'filter');
  // 没给 --roast-level 就留空：以前会按豆种猜一个（filter → 浅度烘焙），猜错就污染筛选。
  assert.equal(payload.bean.roastLevel, undefined);
  // App 里默认是「已到手」，只有在 App 里手动设为在途才是 true。
  assert.equal(payload.bean.isInTransit, false);
  // 赏味期按烘焙度取 App 预设；烘焙度为空时按中烘 10/60（以前固定写 30/60）。
  assert.equal(payload.bean.startDay, 10);
  assert.equal(payload.bean.endDay, 60);
  assert.deepEqual(payload.bean.blendComponents, [{ origin: 'O', process: 'P' }]);
});

test('brew-guide bean add only requires a name, like the app form', () => {
  // App 的表单里只有「咖啡豆名称」带必填星号（BasicInfo.tsx:481-521），
  // 产地、处理法、烘焙商都可以空着存，CLI 不能比 App 严。
  const result = runCliSync(['bean', 'add', '--name', '只有名字', '--dry-run', '--format', 'json'], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.bean.name, '只有名字');
  assert.equal(payload.bean.roaster, undefined);
  assert.equal(payload.bean.blendComponents, undefined);
  assert.equal(payload.bean.beanState, 'roasted');
  assert.equal(payload.bean.isInTransit, false);
});

test('brew-guide bean add builds multiple components from repeated --component', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'Blend',
    '--roaster',
    'R',
    '--component',
    'origin=Peru;region=Cajamarca;process=washed;percentage=40',
    '--component',
    'origin=Brazil;process=natural;percentage=60',
    '--dry-run',
    '--format',
    'json',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.bean.blendComponents, [
    { origin: 'Peru', region: 'Cajamarca', process: 'washed', percentage: 40 },
    { origin: 'Brazil', process: 'natural', percentage: 60 },
  ]);
});

test('brew-guide bean add maps region/altitude/processing station flags into the component', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'Single',
    '--roaster',
    'R',
    '--origin',
    'Ethiopia',
    '--region',
    'Guji Hambela',
    '--estate',
    'Buku Sayisa',
    '--processing-station',
    'Buku',
    '--altitude',
    '2350-2460m',
    '--process',
    'natural',
    '--variety',
    '74158',
    '--dry-run',
    '--format',
    'json',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.bean.blendComponents, [{
    origin: 'Ethiopia',
    region: 'Guji Hambela',
    estate: 'Buku Sayisa',
    processingStation: 'Buku',
    process: 'natural',
    variety: '74158',
    altitude: '2350-2460m',
  }]);
});

test('brew-guide bean add rejects unknown --component keys', () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'X',
    '--roaster',
    'R',
    '--component',
    'originn=Peru;process=washed',
    '--dry-run',
  ], {
    env: getOfflineEnv(),
  });

  assert.equal(result.status, 2);
  assert.match(`${result.stderr}${result.stdout}`, /不认识字段/);
});

test('brew-guide bean add can write to real Supabase when credentials are available', { skip: !process.env.BREW_GUIDE_SUPABASE_URL }, () => {
  const result = runCliSync([
    'bean',
    'add',
    '--name',
    'Test Bean',
    '--roaster',
    'Test',
    '--origin',
    'Test',
    '--process',
    'washed',
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Created bean bean_/);
});
