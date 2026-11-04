/**
 * 赏味期默认值：跟着 App 里的用户设置走，而不是永远用兜底预设。
 *
 * App 的优先级（`brew-guide/src/lib/utils/flavorPeriodUtils.ts:100-140`）：
 *   1. 该烘焙商的配置 `roasterConfigs[].flavorPeriod`
 *   2. 全局自定义 `customFlavorPeriod`
 *   3. 兜底预设 `PRESET_VALUES`（浅 7/60、中 10/60、深 14/90）
 *
 * 每一档、每个字段各自回落（`startDay` 取第一层 > 0 的值，`endDay` 同理），
 * 所以「只改了浅烘的 startDay」这种半截配置也能正确生效。
 */
import {
  FLAVOR_PERIOD_PRESETS,
  flavorTierForRoastLevel,
  type FlavorPeriod,
  type FlavorTier,
} from './roast.ts';

/** App 里天数允许是数字或数字字符串，空值表示「没设」。 */
export type FlavorPeriodDay = number | string | null | undefined;

export interface FlavorPeriodTier {
  startDay?: FlavorPeriodDay;
  endDay?: FlavorPeriodDay;
}

/** `customFlavorPeriod` / `roasterConfig.flavorPeriod` 的形状（models.ts:69-85）。 */
export interface FlavorPeriodMap {
  light?: FlavorPeriodTier;
  medium?: FlavorPeriodTier;
  dark?: FlavorPeriodTier;
}

/** `RoasterConfig`（models.ts:78-85），只保留 CLI 用得到的字段。 */
export interface RoasterFlavorConfig {
  roasterName: string;
  flavorPeriod?: FlavorPeriodMap;
}

export interface FlavorPeriodSettings {
  customFlavorPeriod?: FlavorPeriodMap;
  roasterConfigs?: RoasterFlavorConfig[];
}

export type FlavorPeriodSource = 'roaster' | 'custom' | 'preset';

export interface ResolvedFlavorPeriod extends FlavorPeriod {
  source: FlavorPeriodSource;
}

/** App 的 `normalizeFlavorPeriodDay`：只认正数，其余算 0（=没设）。 */
export function normalizePeriodDay(value: FlavorPeriodDay): number {
  const day = Number(value);
  return Number.isFinite(day) && day > 0 ? day : 0;
}

function tierOf(map: FlavorPeriodMap | undefined, tier: FlavorTier): FlavorPeriod {
  const raw = map?.[tier];
  return { startDay: normalizePeriodDay(raw?.startDay), endDay: normalizePeriodDay(raw?.endDay) };
}

function hasAnyDay(period: FlavorPeriod): boolean {
  return period.startDay > 0 || period.endDay > 0;
}

/** 烘焙商名在 App 里空值或「未知烘焙商」时不查烘焙商配置（flavorPeriodUtils.ts:108）。 */
function usableRoasterName(name?: string): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === '未知烘焙商') return undefined;
  return trimmed;
}

export function resolveFlavorPeriod(
  roastLevel: string | undefined | null,
  roasterName: string | undefined | null,
  settings?: FlavorPeriodSettings,
): ResolvedFlavorPeriod {
  const tier = flavorTierForRoastLevel(roastLevel);
  const preset = FLAVOR_PERIOD_PRESETS[tier];
  const globalPeriod = tierOf(settings?.customFlavorPeriod, tier);

  const roaster = usableRoasterName(roasterName ?? undefined);
  if (roaster && settings?.roasterConfigs) {
    const config = settings.roasterConfigs.find((item) => item?.roasterName?.trim() === roaster);
    if (config?.flavorPeriod) {
      const specific = tierOf(config.flavorPeriod, tier);
      if (hasAnyDay(specific)) {
        return {
          startDay: specific.startDay || globalPeriod.startDay || preset.startDay,
          endDay: specific.endDay || globalPeriod.endDay || preset.endDay,
          source: 'roaster',
        };
      }
    }
  }

  if (hasAnyDay(globalPeriod)) {
    return {
      startDay: globalPeriod.startDay || preset.startDay,
      endDay: globalPeriod.endDay || preset.endDay,
      source: 'custom',
    };
  }

  return { startDay: preset.startDay, endDay: preset.endDay, source: 'preset' };
}
