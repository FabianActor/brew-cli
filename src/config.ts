import fs from 'node:fs/promises';
import { loadConfig } from 'c12';
import { getConfigPath } from './paths.ts';

export interface BrewGuideConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  brewGuideUserId: string;
}

function getConfigError(message: string) {
  return new Error(`${message} Run "brew-guide init" to create a config file.`);
}

export async function resolveConfig(): Promise<BrewGuideConfig> {
  const configPath = getConfigPath();

  const { config, configFile } = await loadConfig<BrewGuideConfig>({
    configFile: configPath,
    rcFile: false,
    dotenv: true,
    defaults: {
      brewGuideUserId: 'default_user',
    } as BrewGuideConfig,
  });

  const supabaseUrl = process.env.BREW_GUIDE_SUPABASE_URL ?? config.supabaseUrl;
  const supabaseServiceRoleKey =
    process.env.BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY ?? config.supabaseServiceRoleKey;
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

  if (!supabaseServiceRoleKey) {
    throw getConfigError('Missing supabaseServiceRoleKey.');
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
    supabaseServiceRoleKey: String(supabaseServiceRoleKey),
    brewGuideUserId: String(brewGuideUserId),
  };
}
