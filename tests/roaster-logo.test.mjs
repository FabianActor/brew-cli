import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCliSync } from './helpers/cli.mjs';
import {
  describeRoasterLogo,
  listRoasterLogos,
  withRoasterLogo,
} from '../src/lib/roasterLogo.ts';

// 1x1 透明 PNG —— 只用来喂 `--image`，内容是假的也无所谓（CLI 不解码）。
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function dataUrl(buffer, mime = 'image/png') {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// CLI 不解码图片，体积按 base64 长度估算（与 lib/images.ts 的 imageDataUrlBytes 同式）。
function payloadBytes(buffer) {
  return Math.round((buffer.toString('base64').length * 3) / 4);
}

function appSettingsWith(...configs) {
  return {
    customFlavorPeriod: {},
    roasterConfigs: configs,
    flavorDimensions: ['酸', '甜'],
  };
}

test('withRoasterLogo 给新烘焙商建配置项，其他设置原样保留', () => {
  const logo = dataUrl(TINY_PNG);
  const write = withRoasterLogo({ roasterConfigs: [], flavorDimensions: ['酸'] }, '良致', logo, 1000);

  assert.equal(write.created, true);
  assert.equal(write.logoUpdatedAt, 1000);
  assert.deepEqual(write.appSettings.flavorDimensions, ['酸']);
  const configs = write.appSettings.roasterConfigs;
  assert.equal(configs.length, 1);
  assert.equal(configs[0].roasterName, '良致');
  assert.equal(configs[0].logoData, logo);
  assert.equal(configs[0].updatedAt, 1000);
});

test('withRoasterLogo 改已有配置时保留赏味期等字段，版本号严格递增', () => {
  const before = appSettingsWith({
    roasterName: '良致',
    flavorPeriod: { light: { startDay: 7, endDay: 60 } },
    logoData: dataUrl(TINY_PNG),
    logoUpdatedAt: 5000,
    updatedAt: 4000,
    note: '别的字段',
  });

  const write = withRoasterLogo(before, '良致', dataUrl(Buffer.from('new')), 4500);

  // now 比旧版本号还小：也要 +1，否则 App 看不出图变了。
  assert.equal(write.logoUpdatedAt, 5001);
  assert.equal(write.created, false);
  const config = write.appSettings.roasterConfigs[0];
  assert.deepEqual(config.flavorPeriod, { light: { startDay: 7, endDay: 60 } });
  assert.equal(config.note, '别的字段');
  assert.equal(config.updatedAt, 4500);
});

test('withRoasterLogo 删图标是删掉 logoData 键，并让版本号继续前进', () => {
  const before = appSettingsWith({
    roasterName: '良致',
    logoData: dataUrl(TINY_PNG),
    logoUpdatedAt: 10,
  });

  const write = withRoasterLogo(before, '良致', null, 20);
  const config = write.appSettings.roasterConfigs[0];

  assert.equal(write.logoUpdatedAt, 20); // max(now, 旧值 10 + 1)
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'logoData'), false);
  // 真正写库前会 JSON 序列化，undefined 键在这一步就该消失。
  assert.equal(JSON.parse(JSON.stringify(config)).logoData, undefined);
});

test('withRoasterLogo 不动别的烘焙商配置', () => {
  const other = { roasterName: '麒麟方舟', logoData: dataUrl(TINY_PNG), logoUpdatedAt: 1 };
  const before = appSettingsWith({ ...other }, { roasterName: '良致', logoUpdatedAt: 2 });

  const write = withRoasterLogo(before, '良致', null, 100);

  assert.deepEqual(write.appSettings.roasterConfigs[0], other);
  assert.equal(write.appSettings.roasterConfigs.length, 2);
});

test('describeRoasterLogo 区分「没配置」「有配置没图标」「有图标」', () => {
  const appSettings = appSettingsWith(
    { roasterName: '只有赏味期', flavorPeriod: { light: { startDay: 7 } } },
    { roasterName: '有图标', logoData: dataUrl(TINY_PNG), logoUpdatedAt: 77 },
  );

  assert.deepEqual(describeRoasterLogo(appSettings, '不存在的'), {
    configured: false,
    hasLogo: false,
    logoBytes: undefined,
    logoUpdatedAt: undefined,
  });

  const noLogo = describeRoasterLogo(appSettings, '只有赏味期');
  assert.equal(noLogo.configured, true);
  assert.equal(noLogo.hasLogo, false);

  const withLogo = describeRoasterLogo(appSettings, '有图标');
  assert.equal(withLogo.hasLogo, true);
  assert.equal(withLogo.logoBytes, payloadBytes(TINY_PNG));
  assert.equal(withLogo.logoUpdatedAt, 77);
});

test('listRoasterLogos 只列真的有图标的，跳过坏值', () => {
  const appSettings = appSettingsWith(
    { roasterName: 'A', logoData: dataUrl(TINY_PNG), logoUpdatedAt: 1 },
    { roasterName: 'B', logoUpdatedAt: 2 },
    { roasterName: 'C', logoData: 'not-a-data-url' },
    { logoData: dataUrl(TINY_PNG) },
    null,
  );

  const logos = listRoasterLogos(appSettings);
  assert.equal(logos.length, 1);
  assert.equal(logos[0].roasterName, 'A');
  assert.equal(logos[0].logoBytes, payloadBytes(TINY_PNG));
});

test('roasters logo 拒绝同时给 --image 和 --clear', () => {
  const result = runCliSync(['roasters', 'logo', '--name', '良致', '--image', 'a.png', '--clear']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--image 和 --clear 只能二选一/);
});

test('roasters logo 在没有 --name 时拒绝 --image', () => {
  const result = runCliSync(['roasters', 'logo', '--image', 'a.png']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /必须用 --name 指定烘焙商/);
});

test('roasters logo 拒绝未知 flag', () => {
  const result = runCliSync(['roasters', 'logo', '--bogus']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /不认识 --bogus/);
});

test('roasters logo --dry-run 打印计划但不联网', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brew-cli-logo-'));
  try {
    const file = join(dir, 'logo.png');
    writeFileSync(file, TINY_PNG);

    const result = runCliSync([
      'roasters',
      'logo',
      '--name',
      '良致',
      '--image',
      file,
      '--dry-run',
    ]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\[dry-run\] Would set the logo of roaster 良致/);
    assert.match(result.stdout, /\d+ B/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('roasters logo --dry-run --format json 给出结构化预览', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brew-cli-logo-'));
  try {
    const file = join(dir, 'logo.png');
    writeFileSync(file, TINY_PNG);

    const result = runCliSync([
      'roasters',
      'logo',
      '--name',
      '良致',
      '--image',
      file,
      '--dry-run',
      '--format',
      'json',
    ]);
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.roaster, '良致');
    assert.equal(payload.action, 'set');
    assert.equal(payload.logoBytes, payloadBytes(TINY_PNG));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('roasters logo --clear --dry-run 不给名字就报错', () => {
  const result = runCliSync(['roasters', 'logo', '--clear', '--dry-run']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /必须用 --name 指定烘焙商/);
});

test('roasters logo 超过烘焙商图标上限就拒绝（0.12 MB）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brew-cli-logo-'));
  try {
    const file = join(dir, 'big.png');
    writeFileSync(file, Buffer.alloc(130 * 1024, 7));

    const result = runCliSync(['roasters', 'logo', '--name', '良致', '--image', file, '--dry-run']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /超过烘焙商图标上限 0\.12 MB/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('roasters list 与 roasters 等价（子命令没把老用法弄坏）', () => {
  // 没有配置时两个入口都应该因为缺配置而退出 64，而不是「Unknown command」。
  const env = { BREW_GUIDE_SUPABASE_URL: '', BREW_GUIDE_SUPABASE_KEY: '' };
  const bare = runCliSync(['roasters'], { env });
  const viaList = runCliSync(['roasters', 'list'], { env });

  assert.equal(bare.status, 64);
  assert.equal(viaList.status, 64);
  assert.doesNotMatch(bare.stderr, /Unknown command/);
});
