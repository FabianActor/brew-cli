import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CACHE_TTL_MS,
  compareVersions,
  checkForUpdate,
  fetchLatestVersion,
  isCacheStale,
  isNewerVersion,
  maybeNotifyUpdate,
  readUpdateCache,
  startBackgroundUpdateCheck,
  writeUpdateCache,
} from '../src/lib/updateCheck.ts';
import { runCliSync } from './helpers/cli.mjs';

// 2026-11-05：更新检查。设计上「提示不等网络」——提示读本地缓存，网络只在
// 后台刷新缓存；同一个新版本只提示一次。这组用例钉住这两条和「失败静默」。

async function makeCachePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brew-update-'));
  return { dir, cachePath: path.join(dir, 'update-check.json') };
}

function makeStream() {
  const chunks = [];
  return { chunks, write: (chunk) => chunks.push(String(chunk)) };
}

function jsonResponse(payload, ok = true) {
  return { ok, json: async () => payload };
}

test('compareVersions orders by major/minor/patch and treats prerelease as older', () => {
  assert.equal(compareVersions('0.3.1', '0.3.0'), 1);
  assert.equal(compareVersions('0.3.0', '0.3.0'), 0);
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('v0.2.2', '0.2.2'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compareVersions('garbage', '0.3.0'), 0);
});

test('isNewerVersion is strict about equality', () => {
  assert.equal(isNewerVersion('0.3.1', '0.3.0'), true);
  assert.equal(isNewerVersion('0.3.0', '0.3.0'), false);
  assert.equal(isNewerVersion('0.2.9', '0.3.0'), false);
});

test('isCacheStale respects the 24h TTL and unreadable timestamps', () => {
  const now = Date.parse('2026-11-05T00:00:00.000Z');
  assert.equal(isCacheStale(null, now), true);
  assert.equal(isCacheStale({ checkedAt: new Date(now - 1000).toISOString(), latest: '0.3.1' }, now), false);
  assert.equal(isCacheStale({ checkedAt: new Date(now - CACHE_TTL_MS - 1000).toISOString(), latest: '0.3.1' }, now), true);
  assert.equal(isCacheStale({ checkedAt: 'not-a-date', latest: '0.3.1' }, now), true);
});

test('fetchLatestVersion returns the version, and null on any failure', async () => {
  const ok = await fetchLatestVersion({ fetchImpl: async () => jsonResponse({ version: '0.4.0' }) });
  assert.equal(ok, '0.4.0');

  const badStatus = await fetchLatestVersion({ fetchImpl: async () => jsonResponse({}, false) });
  assert.equal(badStatus, null);

  const throws = await fetchLatestVersion({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(throws, null);

  const noVersion = await fetchLatestVersion({ fetchImpl: async () => jsonResponse({ name: 'x' }) });
  assert.equal(noVersion, null);
});

test('maybeNotifyUpdate prints once from cache and remembers it', async () => {
  const { cachePath } = await makeCachePath();
  await writeUpdateCache({ checkedAt: new Date().toISOString(), latest: '0.3.1' }, cachePath);

  const stream = makeStream();
  const first = await maybeNotifyUpdate('0.3.0', { cachePath, stream });
  assert.equal(first?.latest, '0.3.1');
  assert.equal(first?.source, 'cache');
  assert.match(stream.chunks.join(''), /0\.3\.1 已发布（你用的是 0\.3\.0）/);
  assert.match(stream.chunks.join(''), /npm install -g @fabianactor\/brew-cli@latest/);

  const again = makeStream();
  const second = await maybeNotifyUpdate('0.3.0', { cachePath, stream: again });
  assert.equal(second, null);
  assert.equal(again.chunks.length, 0);

  const cache = await readUpdateCache(cachePath);
  assert.equal(cache?.notifiedVersion, '0.3.1');
});

test('maybeNotifyUpdate stays quiet when up to date, without cache, or when disabled', async () => {
  const { cachePath } = await makeCachePath();

  const missing = makeStream();
  assert.equal(await maybeNotifyUpdate('0.3.0', { cachePath, stream: missing }), null);
  assert.equal(missing.chunks.length, 0);

  await writeUpdateCache({ checkedAt: new Date().toISOString(), latest: '0.3.0' }, cachePath);
  const current = makeStream();
  assert.equal(await maybeNotifyUpdate('0.3.0', { cachePath, stream: current }), null);
  assert.equal(current.chunks.length, 0);

  process.env.BREW_GUIDE_NO_UPDATE_CHECK = '1';
  try {
    await writeUpdateCache({ checkedAt: new Date().toISOString(), latest: '0.9.9' }, cachePath);
    const disabled = makeStream();
    assert.equal(await maybeNotifyUpdate('0.3.0', { cachePath, stream: disabled }), null);
    assert.equal(disabled.chunks.length, 0);
  } finally {
    delete process.env.BREW_GUIDE_NO_UPDATE_CHECK;
  }
});

test('checkForUpdate hits the registry and refreshes the cache', async () => {
  const { cachePath } = await makeCachePath();
  const status = await checkForUpdate('0.3.0', {
    cachePath,
    fetchImpl: async () => jsonResponse({ version: '0.3.2' }),
  });

  assert.deepEqual(status, { current: '0.3.0', latest: '0.3.2', upgradable: true, source: 'registry' });
  const cache = await readUpdateCache(cachePath);
  assert.equal(cache?.latest, '0.3.2');
});

test('startBackgroundUpdateCheck refreshes a stale cache without blocking', async () => {
  const { cachePath } = await makeCachePath();
  await writeUpdateCache({ checkedAt: '2020-01-01T00:00:00.000Z', latest: '0.1.0' }, cachePath);

  startBackgroundUpdateCheck('0.3.0', {
    cachePath,
    fetchImpl: async () => jsonResponse({ version: '0.4.0' }),
  });

  let cache = await readUpdateCache(cachePath);
  for (let attempt = 0; attempt < 50 && cache?.latest !== '0.4.0'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    cache = await readUpdateCache(cachePath);
  }
  assert.equal(cache?.latest, '0.4.0');
});

test('startBackgroundUpdateCheck leaves a fresh cache alone', async () => {
  const { cachePath } = await makeCachePath();
  await writeUpdateCache({ checkedAt: new Date().toISOString(), latest: '0.3.0' }, cachePath);

  let called = 0;
  startBackgroundUpdateCheck('0.3.0', {
    cachePath,
    fetchImpl: async () => { called += 1; return jsonResponse({ version: '0.9.9' }); },
  });
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(called, 0);
  assert.equal((await readUpdateCache(cachePath))?.latest, '0.3.0');
});

// 提示里的版本号必须取自 package.json：写死成 "0.3.1" 会在版本升到 0.3.1 那天
// 变成「自己就是最新版，当然不提示」，用例假红（2026-11-05 发布 0.3.1 时撞过一次）。
const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const CURRENT_VERSION = packageJson.version;
const NEXT_VERSION = (() => {
  const [major, minor, patch] = String(CURRENT_VERSION).split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
})();

test('the CLI prints the notice from cache before running the command', async () => {
  const { dir, cachePath } = await makeCachePath();
  await writeUpdateCache({ checkedAt: new Date().toISOString(), latest: NEXT_VERSION }, cachePath);

  const result = runCliSync(['bean', 'list'], {
    env: {
      BREW_GUIDE_NO_UPDATE_CHECK: '',
      BREW_GUIDE_CONFIG_PATH: path.join(dir, 'config.json'),
    },
  });

  assert.match(result.stderr, new RegExp(`${NEXT_VERSION.replace(/\./g, '\\.')} 已发布`));
  assert.match(result.stderr, new RegExp(`${CURRENT_VERSION.replace(/\./g, '\\.')}）`));
  assert.match(result.stderr, /npm install -g @fabianactor\/brew-cli@latest/);
});

test('update-check is a registered command', () => {
  const result = runCliSync(['--help'], { env: { BREW_GUIDE_NO_UPDATE_CHECK: '1' } });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /update-check/);
});
