import fs from 'node:fs/promises';
import path from 'node:path';

import { getConfigPath } from '../paths.ts';

/**
 * 更新检查。
 *
 * 两条硬规则，都是为了让「知道自己落后了」这件事不变成负担：
 *
 * 1. **提示永远不等网络。** 提示只用上一次查到的结果（本地缓存），网络
 *    只在后台刷新缓存。实测这个 registry 接口在本机要 0.86–2.4 秒，同步
 *    等它就等于给每条命令加一秒延迟。
 * 2. **同一个新版本只提示一次。** 用户看过、忽略了，就不再念；
 *    等真有更新的一版出现才再说。
 *
 * 失败一律静默：离线、超时、非 200、JSON 解析失败都不影响命令本身。
 */

export const PACKAGE_NAME = '@fabianactor/brew-cli';
export const REGISTRY_LATEST_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 1500;
export const DISABLE_ENV = 'BREW_GUIDE_NO_UPDATE_CHECK';

export interface UpdateCache {
  /** 上次成功查询的时间（ISO 字符串）。 */
  checkedAt: string;
  /** 上次查到的 npm 最新版本。 */
  latest: string;
  /** 已经提示过的版本，用来避免反复念同一件事。 */
  notifiedVersion?: string;
}

export interface UpdateStatus {
  current: string;
  latest: string;
  upgradable: boolean;
  source: 'cache' | 'registry';
}

export interface FetchOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  url?: string;
}

type CachePathOption = { cachePath?: string };
type StreamOption = { stream?: { write: (chunk: string) => unknown } };

export function getUpdateCachePath(): string {
  return path.join(path.dirname(getConfigPath()), 'update-check.json');
}

export function isUpdateCheckDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[DISABLE_ENV];
  return value === '1' || value === 'true';
}

function parseVersion(version: string): { numbers: number[]; prerelease: string | null } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(version).trim());
  if (!match) {
    return null;
  }
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? null,
  };
}

/** 比较两个版本号：left 更新返回 1，相等 0，更旧 -1。无法解析时按相等处理。 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) {
      return a.numbers[index] > b.numbers[index] ? 1 : -1;
    }
  }

  if (a.prerelease === b.prerelease) {
    return 0;
  }
  // 同一个 x.y.z 下，带预发布标记的比正式版旧。
  if (a.prerelease === null) {
    return 1;
  }
  if (b.prerelease === null) {
    return -1;
  }
  return a.prerelease > b.prerelease ? 1 : -1;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

export async function readUpdateCache(cachePath = getUpdateCachePath()): Promise<UpdateCache | null> {
  try {
    const raw = await fs.readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<UpdateCache>;
    if (typeof parsed?.latest !== 'string' || typeof parsed?.checkedAt !== 'string') {
      return null;
    }
    return {
      checkedAt: parsed.checkedAt,
      latest: parsed.latest,
      ...(typeof parsed.notifiedVersion === 'string' ? { notifiedVersion: parsed.notifiedVersion } : {}),
    };
  } catch {
    return null;
  }
}

export async function writeUpdateCache(cache: UpdateCache, cachePath = getUpdateCachePath()): Promise<void> {
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  } catch {
    // 缓存写不进去不影响使用，下次再查。
  }
}

export function isCacheStale(cache: UpdateCache | null, now = Date.now(), ttlMs = CACHE_TTL_MS): boolean {
  if (!cache) {
    return true;
  }
  const checkedAt = Date.parse(cache.checkedAt);
  if (!Number.isFinite(checkedAt)) {
    return true;
  }
  return now - checkedAt > ttlMs;
}

/** 查 npm 上的最新版本；任何失败都返回 null。 */
export async function fetchLatestVersion(options: FetchOptions = {}): Promise<string | null> {
  const {
    timeoutMs = FETCH_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    url = REGISTRY_LATEST_URL,
  } = options;

  if (typeof fetchImpl !== 'function') {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 不让这个定时器把进程吊住。
  timer.unref?.();

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { version?: unknown };
    return typeof payload?.version === 'string' ? payload.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function formatNotice(status: UpdateStatus): string {
  return [
    `提示：brew-guide ${status.latest} 已发布（你用的是 ${status.current}）`,
    `      npm install -g ${PACKAGE_NAME}@latest`,
    `      只提示一次；不想检查就设 ${DISABLE_ENV}=1`,
    '',
  ].join('\n');
}

/**
 * 从缓存里取「最新版本」，落后就在 stderr 提示一次。
 * 不联网、不阻塞；同一个版本提示过一次就不再提。
 */
export async function maybeNotifyUpdate(
  currentVersion: string,
  options: CachePathOption & StreamOption = {},
): Promise<UpdateStatus | null> {
  if (isUpdateCheckDisabled()) {
    return null;
  }

  const cache = await readUpdateCache(options.cachePath);
  if (!cache || !isNewerVersion(cache.latest, currentVersion)) {
    return null;
  }
  if (cache.notifiedVersion === cache.latest) {
    return null;
  }

  const stream = options.stream ?? process.stderr;
  stream.write(formatNotice({
    current: currentVersion,
    latest: cache.latest,
    upgradable: true,
    source: 'cache',
  }));

  await writeUpdateCache({ ...cache, notifiedVersion: cache.latest }, options.cachePath);
  return { current: currentVersion, latest: cache.latest, upgradable: true, source: 'cache' };
}

/**
 * 缓存过期时在后台刷新一次。不 await、不阻塞、失败静默。
 * 最坏情况下（网络慢到超时）进程会多活到那 1.5 秒，一天最多一次。
 */
export function startBackgroundUpdateCheck(currentVersion: string, options: FetchOptions & CachePathOption = {}): void {
  if (isUpdateCheckDisabled()) {
    return;
  }

  void (async () => {
    const cache = await readUpdateCache(options.cachePath);
    if (!isCacheStale(cache)) {
      return;
    }

    const latest = await fetchLatestVersion(options);
    if (!latest) {
      return;
    }

    await writeUpdateCache({
      checkedAt: new Date().toISOString(),
      latest,
      ...(cache?.notifiedVersion ? { notifiedVersion: cache.notifiedVersion } : {}),
    }, options.cachePath);
  })();
}

/** 手动查询：总是联网，并顺手更新缓存。查不到返回 null。 */
export async function checkForUpdate(
  currentVersion: string,
  options: FetchOptions & CachePathOption = {},
): Promise<UpdateStatus | null> {
  const latest = await fetchLatestVersion(options);
  if (!latest) {
    return null;
  }

  const previous = await readUpdateCache(options.cachePath);
  await writeUpdateCache({
    checkedAt: new Date().toISOString(),
    latest,
    ...(previous?.notifiedVersion === latest ? { notifiedVersion: latest } : {}),
  }, options.cachePath);

  return {
    current: currentVersion,
    latest,
    upgradable: isNewerVersion(latest, currentVersion),
    source: 'registry',
  };
}
