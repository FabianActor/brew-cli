import fs from 'node:fs/promises';
import { loadConfig } from 'c12';
import { getConfigPath } from './paths.ts';

/**
 * 配置字段。`supabaseKey` 装的是 publishable（旧称 anon）key —— 它能用是因为
 * brew-guide 的表用 `USING (true)` 宽 RLS，不是因为绕过了 RLS。
 * 旧字段名 `supabaseServiceRoleKey` 仍可读，见 resolveConfig。
 */
export interface BrewGuideConfig {
  supabaseUrl: string;
  supabaseKey: string;
  brewGuideUserId: string;
}

/** 旧版本写下的配置里叫这个名字，值其实是同一把 key。 */
interface LegacyConfigShape {
  supabaseServiceRoleKey?: string;
}

function getConfigError(message: string) {
  return new Error(`${message} Run "brew-guide init" to create a config file.`);
}

export async function resolveConfig(): Promise<BrewGuideConfig> {
  const configPath = getConfigPath();

  const { config, configFile } = await loadConfig<BrewGuideConfig & LegacyConfigShape>({
    configFile: configPath,
    rcFile: false,
    dotenv: true,
    defaults: {
      brewGuideUserId: 'default_user',
    } as BrewGuideConfig,
  });

  const supabaseUrl = process.env.BREW_GUIDE_SUPABASE_URL ?? config.supabaseUrl;

  // 新名 supabaseKey / BREW_GUIDE_SUPABASE_KEY；旧的 service-role 名字继续认，
  // 但要提醒一句——那个名字会让人误以为这把 key 能绕过 RLS。
  const envKey = process.env.BREW_GUIDE_SUPABASE_KEY;
  const legacyEnvKey = process.env.BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY;
  const legacyFileKey = config.supabaseServiceRoleKey;

  const supabaseKey = envKey ?? legacyEnvKey ?? config.supabaseKey ?? legacyFileKey;
  // 生效值来自旧名字时提醒一次；新名字在场就不吵。
  const effectiveSource = envKey
    ? 'new'
    : legacyEnvKey
      ? 'legacy'
      : config.supabaseKey
        ? 'new'
        : legacyFileKey
          ? 'legacy'
          : 'none';
  const usedLegacyName = effectiveSource === 'legacy';

  if (usedLegacyName) {
    process.stderr.write(
      'Warning: 配置里用的还是旧字段名 supabaseServiceRoleKey，值没问题（它就是 publishable/anon key），' +
        '但名字会误导人以为它能绕过 RLS。改成 supabaseKey，或重跑 brew-guide init。\n',
    );
  }

  const brewGuideUserId = process.env.BREW_GUIDE_USER_ID ?? config.brewGuideUserId ?? 'default_user';

  if (!supabaseUrl) {
    throw getConfigError('Missing supabaseUrl.');
  }

  if (!String(supabaseUrl).startsWith('https://')) {
    throw new Error('Config error: supabaseUrl must start with "https://".');
  }

  // 尾斜杠会让拼接出的 `//rest/v1` 变成另一条路径（部分网关会 404 或重定向丢鉴权头），
  // 这里统一削掉。
  const normalizedUrl = String(supabaseUrl).trim().replace(/\/+$/, '');

  if (!supabaseKey) {
    throw getConfigError(
      'Missing supabaseKey (publishable or legacy anon key, from Supabase → Project Settings → API Keys).',
    );
  }

  // Windows 上没有 POSIX 权限位（chmod 是空操作，stat.mode 恒为 0666），
  // 在这里检查只会每次运行都误报，故只在类 Unix 平台检查。
  if (configFile && process.platform !== 'win32') {
    try {
      const stat = await fs.stat(configFile);
      if ((stat.mode & 0o077) !== 0) {
        process.stderr.write('Warning: config file has insecure permissions\n');
      }
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
    }
  }

  return {
    supabaseUrl: normalizedUrl,
    supabaseKey: String(supabaseKey),
    brewGuideUserId: String(brewGuideUserId),
  };
}
