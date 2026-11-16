import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readImageAsDataUrl } from '../src/lib/imageFile.ts';
import { BEAN_IMAGE_POLICY, NOTE_IMAGE_POLICY } from '../src/lib/imagePolicy.ts';
import { runCliSync } from './helpers/cli.mjs';

// 1x1 透明 PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'brew-image-'));
}

test('readImageAsDataUrl turns a file into a data URL', () => {
  const dir = makeTempDir();
  const file = join(dir, 'cover.png');
  writeFileSync(file, TINY_PNG);

  const dataUrl = readImageAsDataUrl(file);
  assert.match(dataUrl, /^data:image\/png;base64,/);
  assert.equal(dataUrl.slice('data:image/png;base64,'.length), TINY_PNG.toString('base64'));
});

test('readImageAsDataUrl rejects unsupported extensions', () => {
  const dir = makeTempDir();
  const file = join(dir, 'cover.bmp');
  writeFileSync(file, TINY_PNG);

  assert.throws(() => readImageAsDataUrl(file), /只支持 .*\.png.*收到/);
});

test('readImageAsDataUrl rejects a missing file', () => {
  const dir = makeTempDir();
  assert.throws(() => readImageAsDataUrl(join(dir, 'nope.png')), /读不到文件/);
});

test('readImageAsDataUrl caps bean images at the upstream policy size', () => {
  const dir = makeTempDir();
  const file = join(dir, 'huge.png');
  writeFileSync(file, Buffer.alloc(Math.ceil(BEAN_IMAGE_POLICY.maxBytes) + 10));

  assert.throws(() => readImageAsDataUrl(file), /超过豆子图片上限 0\.3 MB/);
});

test('readImageAsDataUrl caps note images at 0.1 MB', () => {
  const dir = makeTempDir();
  const file = join(dir, 'cup.png');
  writeFileSync(file, Buffer.alloc(Math.ceil(NOTE_IMAGE_POLICY.maxBytes) + 10));

  assert.throws(
    () => readImageAsDataUrl(file, { policy: NOTE_IMAGE_POLICY }),
    /超过冲煮记录图片上限 0\.1 MB/,
  );
  // 同一张图放在豆子字段上还没超标（豆子是 0.3 MB），说明上限确实是按用途来的。
  assert.match(readImageAsDataUrl(file), /^data:image\/png;base64,/);
});

test('GIFs are not capped, only warned about — the app stores them as-is', () => {
  const dir = makeTempDir();
  const file = join(dir, 'loop.gif');
  writeFileSync(file, Buffer.alloc(Math.ceil(BEAN_IMAGE_POLICY.maxBytes) + 10));

  const result = runCliSync(
    ['bean', 'add', '--name', '带 GIF 的豆', '--image', file, '--dry-run', '--format', 'json'],
    { env: { BREW_GUIDE_CONFIG_PATH: join(dir, 'no-config.json') } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).bean.image, /^data:image\/gif;base64,/);
  assert.match(result.stderr, /GIF 不会被压缩/);
});

test('bean add --image puts the data URL into the payload', () => {
  const dir = makeTempDir();
  const file = join(dir, 'cover.png');
  writeFileSync(file, TINY_PNG);

  const result = runCliSync(['bean', 'add', '--name', '带图的豆', '--image', file, '--dry-run', '--format', 'json'], {
    env: { BREW_GUIDE_CONFIG_PATH: join(dir, 'no-config.json') },
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.bean.image, /^data:image\/png;base64,/);
});

test('note add --image puts the data URL into the payload', () => {
  const dir = makeTempDir();
  const file = join(dir, 'cup.png');
  writeFileSync(file, TINY_PNG);

  const result = runCliSync(['note', 'add', '--image', file, '--dry-run', '--format', 'json'], {
    env: { BREW_GUIDE_CONFIG_PATH: join(dir, 'no-config.json') },
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.note.image, /^data:image\/png;base64,/);
});

test('note add --image over 0.1 MB exits 2', () => {
  const dir = makeTempDir();
  const file = join(dir, 'cup.png');
  writeFileSync(file, Buffer.alloc(Math.ceil(NOTE_IMAGE_POLICY.maxBytes) + 10));

  const result = runCliSync(['note', 'add', '--image', file, '--dry-run'], {
    env: { BREW_GUIDE_CONFIG_PATH: join(dir, 'no-config.json') },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /超过冲煮记录图片上限/);
});

test('--image with a bad path exits 2 with a readable message', () => {
  const dir = makeTempDir();
  const result = runCliSync(['bean', 'add', '--name', 'x', '--image', 'no-such-file.png', '--dry-run'], {
    env: { BREW_GUIDE_CONFIG_PATH: join(dir, 'no-config.json') },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /读不到文件/);
});
