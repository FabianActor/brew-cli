/**
 * `user_settings` 表只有一行配置（`id = app_settings`，业务字段都在 `data` 里），
 * 而且**没有 `deleted_at` 列** —— 所以既不走 `services/base.ts` 的活跃记录查询，
 * 也不能复用那边的 `upsertRecord`（它带 `.is('deleted_at', null)` 过滤，这张表会报 42703）。
 *
 * 形状来源：`brew-guide/src/lib/data/models.ts:167`（customFlavorPeriod）、
 * `:301`（roasterConfigs），运行时落在 `data.appSettings.*` 下。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { StaleRecordError } from './base.ts';
import { now } from '../lib/timestamps.ts';
import type {
  FlavorPeriodMap,
  FlavorPeriodSettings,
  FlavorPeriodTier,
  RoasterFlavorConfig,
} from '../lib/flavorPeriod.ts';

/** 这一行在主应用里写死用这个 id（一个用户一份设置）。 */
export const SETTINGS_ROW_ID = 'app_settings';

export interface SettingsRow {
  id: string;
  data: Record<string, unknown>;
  updated_at: string;
}

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

/** 读整行设置（含 `updated_at`，写回时当版本号用）。还没有这一行时返回 null。 */
export async function fetchSettingsRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<SettingsRow | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('id, data, updated_at')
    .eq('user_id', userId)
    .eq('id', SETTINGS_ROW_ID)
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch user settings: ${error.message}`);
  }

  const row = (data ?? [])[0] as { id?: unknown; data?: unknown; updated_at?: unknown } | undefined;
  if (!row) return null;

  return {
    id: typeof row.id === 'string' ? row.id : SETTINGS_ROW_ID,
    data: isRecord(row.data) ? row.data : {},
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
  };
}

/**
 * 把整份 `data` 写回去，并做 compare-and-swap：只有库里的 `updated_at` 还是读到的
 * 那一版时才写，否则抛 `StaleRecordError`（App 那边同时改了设置，不能盲覆盖）。
 */
export async function updateSettingsData(
  supabase: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  expectedUpdatedAt: string,
): Promise<void> {
  const ts = now();
  const { data: updated, error } = await supabase
    .from('user_settings')
    .update({ data, updated_at: ts })
    .eq('user_id', userId)
    .eq('id', SETTINGS_ROW_ID)
    .eq('updated_at', expectedUpdatedAt)
    .select('id');

  if (error) {
    throw new Error(`Failed to update user settings: ${error.message}`);
  }
  if (!updated || (updated as unknown[]).length === 0) {
    throw new StaleRecordError('user_settings', SETTINGS_ROW_ID);
  }
}

/**
 * 读 App 的赏味期相关设置。返回空对象表示「读到行，但没设置过」——
 * 与读取失败（抛错）区分开，调用方据此决定要不要提示用户。
 */
export async function fetchFlavorPeriodSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<FlavorPeriodSettings> {
  const row = await fetchSettingsRow(supabase, userId);
  if (!row) return {};

  const appSettings = row.data.appSettings;
  if (!isRecord(appSettings)) return {};

  return {
    customFlavorPeriod: toPeriodMap(appSettings.customFlavorPeriod),
    roasterConfigs: toRoasterConfigs(appSettings.roasterConfigs),
  };
}
