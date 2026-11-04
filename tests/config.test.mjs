import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveConfig } from '../src/config.ts';

const originalEnv = { ...process.env };
const originalCwd = process.cwd();

async function withSandbox(t, setup) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'brew-guide-config-'));
  const homeDir = path.join(tempRoot, 'home');
  const workDir = path.join(tempRoot, 'work');
  const configDir = path.join(homeDir, '.config', 'brew-guide');
  const configPath = path.join(configDir, 'config.json');

  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(workDir, { recursive: true });

  t.after(async () => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  process.env = { ...originalEnv, HOME: homeDir };
  process.chdir(workDir);

  await setup({ tempRoot, homeDir, workDir, configDir, configPath });
}

test('resolveConfig prefers environment variables over config file values', async (t) => {
  await withSandbox(t, async ({ configPath }) => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        supabaseUrl: 'https://file.supabase.co',
        supabaseKey: 'file-key',
        brewGuideUserId: 'file-user',
      }),
      'utf8',
    );

    process.env.BREW_GUIDE_SUPABASE_URL = 'https://env.supabase.co';
    process.env.BREW_GUIDE_SUPABASE_KEY = 'env-key';
    process.env.BREW_GUIDE_USER_ID = 'env-user';

    const config = await resolveConfig();

    assert.equal(config.supabaseUrl, 'https://env.supabase.co');
    assert.equal(config.supabaseKey, 'env-key');
    assert.equal(config.brewGuideUserId, 'env-user');
  });
});

test('resolveConfig reads credentials from cwd .env when process env is unset', async (t) => {
  await withSandbox(t, async ({ workDir }) => {
    await fs.writeFile(
      path.join(workDir, '.env'),
      [
        'BREW_GUIDE_SUPABASE_URL=https://dotenv.supabase.co',
        'BREW_GUIDE_SUPABASE_KEY=dotenv-key',
        'BREW_GUIDE_USER_ID=dotenv-user',
      ].join('\n'),
      'utf8',
    );

    delete process.env.BREW_GUIDE_SUPABASE_URL;
    delete process.env.BREW_GUIDE_SUPABASE_KEY;
    delete process.env.BREW_GUIDE_USER_ID;

    const config = await resolveConfig();

    assert.equal(config.supabaseUrl, 'https://dotenv.supabase.co');
    assert.equal(config.supabaseKey, 'dotenv-key');
    assert.equal(config.brewGuideUserId, 'dotenv-user');
  });
});

test('resolveConfig falls back to ~/.config/brew-guide/config.json', async (t) => {
  await withSandbox(t, async ({ configPath }) => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        supabaseUrl: 'https://file-only.supabase.co',
        supabaseKey: 'file-only-key',
        brewGuideUserId: 'file-only-user',
      }),
      'utf8',
    );

    delete process.env.BREW_GUIDE_SUPABASE_URL;
    delete process.env.BREW_GUIDE_SUPABASE_KEY;
    delete process.env.BREW_GUIDE_USER_ID;

    const config = await resolveConfig();

    assert.equal(config.supabaseUrl, 'https://file-only.supabase.co');
    assert.equal(config.supabaseKey, 'file-only-key');
    assert.equal(config.brewGuideUserId, 'file-only-user');
  });
});

test('resolveConfig throws when no credentials are available', async (t) => {
  await withSandbox(t, async () => {
    delete process.env.BREW_GUIDE_SUPABASE_URL;
    delete process.env.BREW_GUIDE_SUPABASE_KEY;
    delete process.env.BREW_GUIDE_USER_ID;

    await assert.rejects(
      () => resolveConfig(),
      (error) => {
        assert.match(error.message, /Missing/i);
        return true;
      },
    );
  });
});

// Windows 没有 POSIX 权限位（stat.mode 恒为 0666），resolveConfig 在该平台不做检查，
// 所以这一组断言只在类 Unix 上成立。
const posixOnly = process.platform === 'win32' ? { skip: 'POSIX permissions are not available on Windows' } : {};

test('resolveConfig warns when config file permissions are too broad', posixOnly, async (t) => {
  await withSandbox(t, async ({ configPath }) => {
    delete process.env.BREW_GUIDE_SUPABASE_URL;
    delete process.env.BREW_GUIDE_SUPABASE_KEY;
    delete process.env.BREW_GUIDE_USER_ID;

    await fs.writeFile(
      configPath,
      JSON.stringify({
        supabaseUrl: 'https://warning.supabase.co',
        supabaseKey: 'warning-key',
      }),
      'utf8',
    );
    await fs.chmod(configPath, 0o644);

    const stderr = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk, encoding, callback) => {
      stderr.push(String(chunk));
      if (typeof encoding === 'function') {
        encoding();
      } else if (typeof callback === 'function') {
        callback();
      }
      return true;
    });

    t.after(() => {
      process.stderr.write = originalWrite;
    });

    const config = await resolveConfig();

    assert.equal(config.supabaseUrl, 'https://warning.supabase.co');
    assert.equal(config.supabaseKey, 'warning-key');
    assert.match(stderr.join(''), /Warning: config file has insecure permissions/i);
  });
});

test(
  'resolveConfig does not warn about file permissions on Windows',
  process.platform === 'win32' ? {} : { skip: 'Windows behaviour only' },
  async (t) => {
    await withSandbox(t, async ({ configPath }) => {
      delete process.env.BREW_GUIDE_SUPABASE_URL;
      delete process.env.BREW_GUIDE_SUPABASE_KEY;
      delete process.env.BREW_GUIDE_USER_ID;

      await fs.writeFile(
        configPath,
        JSON.stringify({
          supabaseUrl: 'https://warning.supabase.co',
          supabaseKey: 'warning-key',
        }),
        'utf8',
      );

      const stderr = [];
      const originalWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = ((chunk, encoding, callback) => {
        stderr.push(String(chunk));
        if (typeof encoding === 'function') {
          encoding();
        } else if (typeof callback === 'function') {
          callback();
        }
        return true;
      });

      t.after(() => {
        process.stderr.write = originalWrite;
      });

      await resolveConfig();

      assert.doesNotMatch(stderr.join(''), /insecure permissions/i);
    });
  },
);

/** 接住 stderr，测试结束后自动还原。 */
function captureStderr(t) {
  const chunks = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk, encoding, callback) => {
    chunks.push(String(chunk));
    if (typeof encoding === 'function') {
      encoding();
    } else if (typeof callback === 'function') {
      callback();
    }
    return true;
  });
  t.after(() => {
    process.stderr.write = originalWrite;
  });
  return chunks;
}

test('resolveConfig still reads the legacy supabaseServiceRoleKey field, with a warning', async (t) => {
  await withSandbox(t, async ({ configPath }) => {
    delete process.env.BREW_GUIDE_SUPABASE_URL;
    delete process.env.BREW_GUIDE_SUPABASE_KEY;
    delete process.env.BREW_GUIDE_USER_ID;

    await fs.writeFile(
      configPath,
      JSON.stringify({
        supabaseUrl: 'https://legacy.supabase.co',
        supabaseServiceRoleKey: 'legacy-key',
      }),
      'utf8',
    );

    const stderr = captureStderr(t);
    const config = await resolveConfig();

    assert.equal(config.supabaseKey, 'legacy-key');
    assert.match(stderr.join(''), /旧字段名 supabaseServiceRoleKey/);
  });
});

test('resolveConfig reads the legacy env var and warns about the misleading name', async (t) => {
  await withSandbox(t, async ({ configPath }) => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        supabaseUrl: 'https://legacy-env.supabase.co',
        supabaseKey: 'file-key',
      }),
      'utf8',
    );

    delete process.env.BREW_GUIDE_SUPABASE_URL;
    delete process.env.BREW_GUIDE_SUPABASE_KEY;
    delete process.env.BREW_GUIDE_USER_ID;
    process.env.BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY = 'legacy-env-key';

    const stderr = captureStderr(t);
    const config = await resolveConfig();

    assert.equal(config.supabaseKey, 'legacy-env-key');
    assert.match(stderr.join(''), /旧字段名 supabaseServiceRoleKey/);
  });
});

test('resolveConfig prefers supabaseKey over the legacy field and stays quiet', async (t) => {
  await withSandbox(t, async ({ configPath }) => {
    delete process.env.BREW_GUIDE_SUPABASE_URL;
    delete process.env.BREW_GUIDE_SUPABASE_KEY;
    delete process.env.BREW_GUIDE_USER_ID;
    delete process.env.BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY;

    await fs.writeFile(
      configPath,
      JSON.stringify({
        supabaseUrl: 'https://both.supabase.co',
        supabaseKey: 'new-key',
        supabaseServiceRoleKey: 'old-key',
      }),
      'utf8',
    );

    const stderr = captureStderr(t);
    const config = await resolveConfig();

    assert.equal(config.supabaseKey, 'new-key');
    assert.doesNotMatch(stderr.join(''), /旧字段名/);
  });
});
