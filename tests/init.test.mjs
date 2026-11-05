import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runInteractiveCli, spawnCli } from './helpers/cli.mjs';

async function createSandbox(t) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'brew-guide-init-'));
  const configPath = path.join(tempRoot, 'config', 'config.json');

  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  return {
    tempRoot,
    configPath,
    env: {
      BREW_GUIDE_CONFIG_PATH: configPath,
    },
  };
}

test('brew-guide init creates a config file with 600 permissions', async (t) => {
  const sandbox = await createSandbox(t);

  const result = await runInteractiveCli(['init'], {
    cwd: process.cwd(),
    env: sandbox.env,
    inputLines: ['https://init.supabase.co', 'service-role-key'],
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /配置已保存至/);

  const saved = JSON.parse(await fs.readFile(sandbox.configPath, 'utf8'));
  const stat = await fs.stat(sandbox.configPath);

  assert.equal(saved.supabaseUrl, 'https://init.supabase.co');
  assert.equal(saved.supabaseKey, 'service-role-key');
  // User ID 不再提问：App 那边写死 default_user，CLI 跟着固定。
  assert.equal(saved.brewGuideUserId, 'default_user');
  // Windows 没有 POSIX 权限位，chmod 是空操作，只在类 Unix 上断言 0600。
  if (process.platform !== 'win32') {
    assert.equal(stat.mode & 0o777, 0o600);
  }
});

test('brew-guide init exits without creating a file when stdin closes immediately', async (t) => {
  const sandbox = await createSandbox(t);
  const { child, completion } = spawnCli(['init'], {
    cwd: process.cwd(),
    env: sandbox.env,
  });

  child.stdin.end();

  const result = await completion;
  const fileExists = await fs
    .access(sandbox.configPath)
    .then(() => true)
    .catch(() => false);

  assert.notEqual(result.code, 0);
  assert.equal(fileExists, false);
});

test('brew-guide init overwrites an existing config after confirmation', async (t) => {
  const sandbox = await createSandbox(t);
  await fs.mkdir(path.dirname(sandbox.configPath), { recursive: true });
  await fs.writeFile(
    sandbox.configPath,
    JSON.stringify({
      supabaseUrl: 'https://old.supabase.co',
      supabaseKey: 'old-key',
      brewGuideUserId: 'old-user',
    }),
    'utf8',
  );

  const result = await runInteractiveCli(['init'], {
    cwd: process.cwd(),
    env: sandbox.env,
    inputLines: ['y', 'https://new.supabase.co', 'new-key'],
  });

  assert.equal(result.code, 0);
  const saved = JSON.parse(await fs.readFile(sandbox.configPath, 'utf8'));
  assert.equal(saved.supabaseUrl, 'https://new.supabase.co');
  assert.equal(saved.supabaseKey, 'new-key');
  assert.equal(saved.brewGuideUserId, 'default_user');
});

test('brew-guide init re-prompts after an invalid URL', async (t) => {
  const sandbox = await createSandbox(t);

  const result = await runInteractiveCli(['init'], {
    cwd: process.cwd(),
    env: sandbox.env,
    inputLines: ['not-a-url', 'https://valid.supabase.co', 'service-role-key'],
  });

  assert.equal(result.code, 0);
  // 错误提示走 stderr，stdout 只留数据/正常输出
  assert.match(result.stderr, /must start with https:\/\//i);
  assert.match(result.stdout, /配置已保存至/);
});
