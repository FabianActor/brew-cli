import { EXIT, exitWithError } from './exit.ts';

/**
 * 豆子状态。App 里 `beanState` 只有两种：`roasted`（默认）和 `green`（生豆）。
 * 生豆把「烘焙日期」换成「购买日期」（purchaseDate），也没有赏味期。
 */
export const BEAN_STATES = ['roasted', 'green'] as const;
export type BeanState = (typeof BEAN_STATES)[number];

export function parseBeanState(value: string, flag = '--bean-state'): BeanState {
  const normalized = value.trim().toLowerCase();
  if (!(BEAN_STATES as readonly string[]).includes(normalized)) {
    exitWithError(`Error: ${flag} 只能是 ${BEAN_STATES.join(' 或 ')}，收到 "${value}"。`, EXIT.USAGE);
  }
  return normalized as BeanState;
}

/** 今天（本地时区，YYYY-MM-DD）。App 新建生豆时就是拿这个值填 purchaseDate。 */
export function todayLocalDate(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateOnly(value: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    exitWithError(`Error: ${flag} must be YYYY-MM-DD.`, EXIT.USAGE);
  }
  return value;
}

/**
 * 价格。App 存的是字符串，读的时候 `parseFloat(price) / capacity` 算「元/克」
 * （BasicInfoSection.tsx:385）——写进非数字会让详情页那行算出 NaN。
 * 顺手容错「¥88」「88元」这种人类写法。
 */
export function parsePrice(value: string, flag = '--price'): string {
  const cleaned = value
    .trim()
    .replace(/^[¥￥]\s*/, '')
    .replace(/\s*(元|块)$/, '')
    .trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    exitWithError(`Error: ${flag} 只接受数字（如 88 或 88.5），收到 "${value}"。`, EXIT.USAGE);
  }
  return cleaned;
}

/**
 * 在途与冷冻在 App 里是互斥的（flavorPeriodUtils.ts:209-215 先判在途再判冷冻，
 * 两个都开只会显示「在途」）。这里统一收口：开一个就关掉另一个。
 */
export interface TransitFlags {
  isInTransit?: boolean;
  isFrozen?: boolean;
}

export function resolveTransitFlags(
  inTransit: unknown,
  isFrozen: unknown,
): TransitFlags {
  const wantedInTransit = typeof inTransit === 'boolean' ? inTransit : undefined;
  const wantedFrozen = typeof isFrozen === 'boolean' ? isFrozen : undefined;

  // 两个都显式设成 true 是矛盾的，直接报错，不替用户猜。
  if (wantedInTransit === true && wantedFrozen === true) {
    exitWithError('Error: 在途和冷冻是互斥状态，不能同时设成 true。', EXIT.USAGE);
  }

  const result: TransitFlags = {};
  if (wantedInTransit !== undefined) {
    result.isInTransit = wantedInTransit;
    if (wantedInTransit) result.isFrozen = false;
  }
  if (wantedFrozen !== undefined) {
    result.isFrozen = wantedFrozen;
    if (wantedFrozen) result.isInTransit = false;
  }
  return result;
}
