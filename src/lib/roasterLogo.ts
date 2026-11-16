/**
 * 烘焙商图标存在 `user_settings.data.appSettings.roasterConfigs[]` 里，每项形如
 *   `{ roasterName, logoData?, logoUpdatedAt?, flavorPeriod?, updatedAt }`
 * （App 侧形状与写入逻辑：`brew-guide/src/lib/stores/settingsStore.ts:544-578`、
 * `brew-guide/src/lib/data/models.ts:78-85`）。
 *
 * 写入规则照抄 App：
 *   - `logoData` 一变，`logoUpdatedAt = Math.max(now, 旧值 + 1)` —— 它是单调递增的版本号，
 *     App 靠它判断要不要重新拉图；
 *   - `updatedAt` 取 `now`；
 *   - 删图标是把 `logoData` 置成 undefined（JSON 序列化时整键丢掉），`logoUpdatedAt` 照样 +1。
 *
 * 这个模块只做纯数据变换，不碰网络：命令层负责读 `user_settings` 再写回。
 */

import { imageDataUrlBytes, isImageDataUrl } from './images.ts';

export interface RoasterLogoState {
  /** 这个烘焙商有没有配置项（只有赏味期配置也算一条）。 */
  configured: boolean;
  hasLogo: boolean;
  /** 图标 base64 载荷的字节数（不含 data URL 前缀）。 */
  logoBytes?: number;
  logoUpdatedAt?: number;
}

export interface RoasterLogoEntry {
  roasterName: string;
  logoBytes: number;
  logoUpdatedAt?: number;
}

export interface RoasterLogoWrite {
  /** 新的 `appSettings`（其余键原样保留）。 */
  appSettings: Record<string, unknown>;
  logoUpdatedAt: number;
  /** 之前没有这个烘焙商的配置项，是这次新建的。 */
  created: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function roasterConfigsOf(appSettings: unknown): unknown[] {
  if (!isRecord(appSettings) || !Array.isArray(appSettings.roasterConfigs)) return [];
  return appSettings.roasterConfigs;
}

function logoUpdatedAtOf(config: Record<string, unknown> | undefined): number | undefined {
  return typeof config?.logoUpdatedAt === 'number' ? config.logoUpdatedAt : undefined;
}

/** 找出某个烘焙商的配置项（可能只有赏味期，没有图标）。 */
export function findRoasterConfig(
  appSettings: unknown,
  roasterName: string,
): Record<string, unknown> | undefined {
  return roasterConfigsOf(appSettings).find(
    (item): item is Record<string, unknown> => isRecord(item) && item.roasterName === roasterName,
  );
}

/** 这个烘焙商现在有没有图标、多大、上次改的时间。 */
export function describeRoasterLogo(appSettings: unknown, roasterName: string): RoasterLogoState {
  const config = findRoasterConfig(appSettings, roasterName);
  const logo = config?.logoData;
  const hasLogo = isImageDataUrl(logo);
  return {
    configured: config !== undefined,
    hasLogo,
    logoBytes: hasLogo ? imageDataUrlBytes(logo) : undefined,
    logoUpdatedAt: logoUpdatedAtOf(config),
  };
}

/** 列出所有配了图标的烘焙商，按配置顺序。 */
export function listRoasterLogos(appSettings: unknown): RoasterLogoEntry[] {
  const entries: RoasterLogoEntry[] = [];
  for (const item of roasterConfigsOf(appSettings)) {
    if (!isRecord(item)) continue;
    const roasterName = typeof item.roasterName === 'string' ? item.roasterName : '';
    if (!roasterName || !isImageDataUrl(item.logoData)) continue;
    entries.push({
      roasterName,
      logoBytes: imageDataUrlBytes(item.logoData),
      logoUpdatedAt: logoUpdatedAtOf(item),
    });
  }
  return entries;
}

/**
 * 返回一份新的 `appSettings`，把图标写进（或删出）指定烘焙商。
 * `logoData` 传 `null` 表示删图标；`nowMs` 可注入，方便测试。
 */
export function withRoasterLogo(
  appSettings: unknown,
  roasterName: string,
  logoData: string | null,
  nowMs: number = Date.now(),
): RoasterLogoWrite {
  const base = isRecord(appSettings) ? { ...appSettings } : {};
  const configs = [...roasterConfigsOf(appSettings)];
  const index = configs.findIndex((item) => isRecord(item) && item.roasterName === roasterName);
  const existing = index >= 0 && isRecord(configs[index]) ? configs[index] : undefined;

  // 版本号必须严格递增：App 在别处改过图标又同步回来时，靠它判断新旧。
  const logoUpdatedAt = Math.max(nowMs, (logoUpdatedAtOf(existing) ?? 0) + 1);

  const updated: Record<string, unknown> = {
    ...(existing ?? {}),
    roasterName,
    logoUpdatedAt,
    updatedAt: nowMs,
  };
  if (logoData === null) {
    // 删图标：整个键去掉（App 也是传 undefined，JSON 序列化后就没有这个字段了）。
    delete updated.logoData;
  } else {
    updated.logoData = logoData;
  }

  if (index >= 0) {
    configs[index] = updated;
  } else {
    configs.push(updated);
  }

  return { appSettings: { ...base, roasterConfigs: configs }, logoUpdatedAt, created: index < 0 };
}
