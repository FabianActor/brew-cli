/**
 * `user_settings` 表只有一行配置（`data.appSettings`），没有 `deleted_at` 列，
 * 所以不走 `services/base.ts` 的活跃记录查询。
 *
 * 形状来源：`brew-guide/src/lib/data/models.ts:167`（customFlavorPeriod）、
 * `:301`（roasterConfigs），运行时落在 `data.appSettings.*` 下。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FlavorPeriodMap,
  FlavorPeriodSettings,
  FlavorPeriodTier,
  RoasterFlavorConfig,
} from '../lib/flavorPeriod.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeTier(value: unknown): value is FlavorPeriodTier {
  if (!isRecord(value)) return false;
  return 'startDay' in value || 'endDay' in value || (Object.keys(value).length === 0);
}

function toPeriodMap(value: unknown): FlavorPeriodMap | undefined {
  if (!isRecord(value)) return undefined;
  const map: FlavorPeriodMap = {};
  for (const tier of ['light', 'medium', 'dark'] as const) {
    const candidate = value[tier];
    if (looksLikeTier(candidate)) {
      map[tier] = candidate as FlavorPeriodTier;
    }
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function toRoasterConfigs(value: unknown): RoasterFlavorConfig[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const configs: RoasterFlavorConfig[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = typeof item.roasterName === 'string' ? item.roasterName : '';
    if (!name) continue;
    configs.push({
      roasterName: name,
      flavorPeriod: toPeriodMap(item.flavorPeriod),
    });
  }
  return configs.length > 0 ? configs : undefined;
}

/**
 * 读 App 的赏味期相关设置。返回空对象表示「读到行，但没设置过」——
 * 与读取失败（抛错）区分开，调用方据此决定要不要提示用户。
 */
export async function fetchFlavorPeriodSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<FlavorPeriodSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('data')
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch user settings: ${error.message}`);
  }

  const row = (data ?? [])[0] as { data?: unknown } | undefined;
  const rowData = row?.data;
  if (!isRecord(rowData)) return {};

  const appSettings = rowData.appSettings;
  if (!isRecord(appSettings)) return {};

  return {
    customFlavorPeriod: toPeriodMap(appSettings.customFlavorPeriod),
    roasterConfigs: toRoasterConfigs(appSettings.roasterConfigs),
  };
}
