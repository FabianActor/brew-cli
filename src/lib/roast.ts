/**
 * 烘焙度与赏味期默认值 —— 口径来自 brew-guide App：
 *
 * - 烘焙度候选值：`brew-guide/src/lib/core/config.ts` + `BrewingTimer.tsx:824-833`
 *   的容错表（App 会把「浅度」补成「浅度烘焙」）。
 * - 赏味期预设：`brew-guide/src/lib/utils/flavorPeriodUtils.ts:27-31`
 *   浅烘 7/60、中烘 10/60、深烘 14/90；App 在烘焙度为空时按中烘处理
 *   （同文件 :52-56 的 `selectPeriodByRoastLevel`：含「浅」取 light、含「深」取 dark，其余 medium）。
 *
 * CLI 以前把 startDay/endDay 一律写成 30/60，App 会据此把浅烘豆算成「养豆期 30 天」，
 * 赏味期整段后移。这里改成与 App 同源，不再自创数值。
 */

/** `BeanItem.beanType`（App 的豆种三态）。 */
export const BEAN_TYPES = ['filter', 'espresso', 'omni'] as const;

export type BeanType = (typeof BEAN_TYPES)[number];

export const ROAST_LEVELS = [  '极浅烘焙',
  '浅度烘焙',
  '中浅烘焙',
  '中度烘焙',
  '中深烘焙',
  '深度烘焙',
] as const;

export type RoastLevel = (typeof ROAST_LEVELS)[number];

/** App 界面上显示的两字缩写 → 完整值（BrewingTimer.tsx:827-832 同一张表）。 */
const SHORT_FORMS: Record<string, RoastLevel> = {
  极浅: '极浅烘焙',
  浅度: '浅度烘焙',
  中浅: '中浅烘焙',
  中度: '中度烘焙',
  中深: '中深烘焙',
  深度: '深度烘焙',
};

export interface NormalizedRoastLevel {
  value: string;
  /** 不是 App 标准值时给出的提醒（仍然照写，不拦）。 */
  warning?: string;
}

export function normalizeRoastLevel(input: string): NormalizedRoastLevel {
  const trimmed = input.trim();
  const mapped = SHORT_FORMS[trimmed] ?? trimmed;
  if ((ROAST_LEVELS as readonly string[]).includes(mapped)) {
    return { value: mapped };
  }
  return {
    value: mapped,
    warning:
      `Warning: --roast-level "${mapped}" 不是 App 的标准值（${ROAST_LEVELS.join(' / ')}）。` +
      '已经照写，但 bean list --roast-level 是精确匹配，这颗豆可能筛不出来。',
  };
}

export interface FlavorPeriod {
  startDay: number;
  endDay: number;
}

/** 与 flavorPeriodUtils.ts:27-31 的 PRESET_VALUES 保持一致。 */
export const FLAVOR_PERIOD_PRESETS: Record<'light' | 'medium' | 'dark', FlavorPeriod> = {
  light: { startDay: 7, endDay: 60 },
  medium: { startDay: 10, endDay: 60 },
  dark: { startDay: 14, endDay: 90 },
};

/**
 * 按烘焙度取赏味期默认值，规则与 App 完全一致：含「浅」→ light、含「深」→ dark、其余 medium。
 * 注意 App 只看烘焙度，不分 filter / espresso。
 */
export function flavorPeriodForRoastLevel(roastLevel?: string): FlavorPeriod {
  const level = roastLevel ?? '';
  if (level.includes('浅')) return FLAVOR_PERIOD_PRESETS.light;
  if (level.includes('深')) return FLAVOR_PERIOD_PRESETS.dark;
  return FLAVOR_PERIOD_PRESETS.medium;
}
