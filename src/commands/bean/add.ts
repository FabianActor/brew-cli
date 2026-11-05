import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { buildBlendComponents, componentFromFlags } from '../../lib/blendComponents.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { printJson, warn } from '../../lib/output.ts';
import {
  parseBeanState,
  parseDateOnly,
  parsePrice,
  resolveTransitFlags,
  todayLocalDate,
} from '../../lib/beanInput.ts';
import { flavorPeriodForRoastLevel, normalizeRoastLevel, BEAN_TYPES } from '../../lib/roast.ts';
import { resolveFlavorPeriod, type FlavorPeriodSettings } from '../../lib/flavorPeriod.ts';
import { fetchFlavorPeriodSettings } from '../../services/settings.ts';
import { normalizeWeight } from '../../lib/weights.ts';
import { upsertBeanRecord } from '../../tools/upsertBean.ts';

/**
 * 读 App 里的赏味期设置（烘焙商配置 / 全局自定义）。读不到就返回 undefined，
 * 由调用方回落到兜底预设——设置是锦上添花，不该让新增豆子失败。
 */
async function loadFlavorPeriodSettings(): Promise<FlavorPeriodSettings | undefined> {
  try {
    const config = await resolveConfig();
    const supabase = createSupabaseClient(config);
    return await fetchFlavorPeriodSettings(supabase, config.brewGuideUserId);
  } catch {
    return undefined;
  }
}

function parseDayArg(value: unknown, fallback: number, flag: string): number {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    exitWithError(`Error: ${flag} must be a non-negative number of days.`, EXIT.USAGE);
  }
  return parsed;
}

function buildBeanData(
  args: Record<string, string | boolean | string[] | undefined>,
  flavorSettings?: FlavorPeriodSettings,
) {
  const normalizedCapacity = typeof args.capacity === 'string' ? normalizeWeight(args.capacity) : undefined;

  const beanData: Record<string, unknown> = {
    name: args.name,
    roaster: args.roaster,
  };

  const blendComponents = buildBlendComponents(args.component, componentFromFlags(args));

  // 烘焙度：给了就照写（顺手把「浅度」补成「浅度烘焙」），没给就留空。
  // 以前没给时会按 bean-type 猜一个（filter→浅度、espresso→中深），猜错就污染 App 的筛选。
  const beanState =
    typeof args['bean-state'] === 'string' && args['bean-state'].trim()
      ? parseBeanState(args['bean-state'])
      : 'roasted';

  let roastLevel: string | undefined;
  if (typeof args['roast-level'] === 'string' && args['roast-level']) {
    if (beanState === 'green') {
      // 生豆还没烘，烘焙度没有意义（App 里生豆的 roastLevel 也是空）。
      warn('Warning: --bean-state green 时不需要烘焙度，--roast-level 已忽略。');
    } else {
      const normalized = normalizeRoastLevel(args['roast-level']);
      if (normalized.warning) warn(normalized.warning);
      roastLevel = normalized.value;
      beanData.roastLevel = roastLevel;
    }
  }

  // 在途/冷冻：App 的默认值是「已到手、没冷冻」（BeanListItem.tsx:304 读 `bean.isInTransit || false`），
  // 只有显式给 --in-transit / --is-frozen 才是 true。两个是互斥状态，见 resolveTransitFlags。
  const transit = resolveTransitFlags(args['in-transit'], args['is-frozen']);
  beanData.isInTransit = transit.isInTransit ?? false;
  beanData.isFrozen = transit.isFrozen ?? false;

  // 生豆与熟豆是两套日期语义（BasicInfoSection.tsx:92-106）：
  // 生豆记「购买日期」，熟豆记「烘焙日期」，App 不会同时显示两个。
  const roastDateArg = typeof args['roast-date'] === 'string' ? args['roast-date'].trim() : '';
  const purchaseDateArg = typeof args['purchase-date'] === 'string' ? args['purchase-date'].trim() : '';
  if (beanState === 'green') {
    if (roastDateArg) {
      exitWithError(
        'Error: 生豆没有烘焙日期（--bean-state green 与 --roast-date 冲突）。要记熟豆就去掉 --bean-state green。',
        EXIT.USAGE,
      );
    }
    beanData.purchaseDate = purchaseDateArg
      ? parseDateOnly(purchaseDateArg, '--purchase-date')
      : todayLocalDate();
  } else {
    if (purchaseDateArg) {
      warn('Warning: --purchase-date 是生豆的字段，熟豆上不显示，已忽略。');
    }
    if (roastDateArg) {
      beanData.roastDate = parseDateOnly(roastDateArg, '--roast-date');
    }
  }
  if (typeof args.price === 'string' && args.price.trim()) {
    beanData.price = parsePrice(args.price);
  }
  if (typeof normalizedCapacity === 'string' && normalizedCapacity) {
    beanData.capacity = normalizedCapacity;
  }

  const beanType =
    typeof args['bean-type'] === 'string' && args['bean-type'] ? args['bean-type'].trim() : 'filter';
  if (!(BEAN_TYPES as readonly string[]).includes(beanType)) {
    exitWithError(`Error: --bean-type must be one of ${BEAN_TYPES.join(', ')}.`, EXIT.USAGE);
  }
  beanData.beanType = beanType;
  if (typeof args.flavor === 'string' && args.flavor) {
    beanData.flavor = args.flavor
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof args.notes === 'string' && args.notes) {
    beanData.notes = args.notes;
  }

  beanData.blendComponents = blendComponents;
  if (blendComponents.length === 0) {
    // 一个成分都没有就干脆不写：App 里没填产地的豆子就是没有这个数组，
    // 写一个空数组进去只会让「有没有填过产地」这件事变得暧昧。
    delete beanData.blendComponents;
  }
  beanData.beanState = beanState;
  if (beanState === 'green') {
    // 生豆没有赏味期：App 用 roastDate + startDay/endDay 算养豆/赏味阶段，生豆不看这两个值。
    if (typeof args['start-day'] === 'string' || typeof args['end-day'] === 'string') {
      warn('Warning: 生豆没有赏味期，--start-day / --end-day 已忽略。');
    }
  } else {
    // 赏味期跟着 App 的用户设置走：烘焙商配置 → 全局自定义 → 兜底预设
    // （App 的优先级见 flavorPeriodUtils.ts:100-140）。以前固定 30/60，
    // 浅烘豆在 App 里会被算成「养豆期 30 天」，赏味期整段后移。
    const period = flavorSettings
      ? resolveFlavorPeriod(roastLevel, typeof args.roaster === 'string' ? args.roaster : undefined, flavorSettings)
      : flavorPeriodForRoastLevel(roastLevel);
    beanData.startDay = parseDayArg(args['start-day'], period.startDay, '--start-day');
    beanData.endDay = parseDayArg(args['end-day'], period.endDay, '--end-day');
  }

  if (typeof normalizedCapacity === 'string' && normalizedCapacity) {
    beanData.remaining = normalizedCapacity;
  }

  return beanData;
}


const argsDef = {
  name: { type: 'string', required: true },
  roaster: { type: 'string', description: '烘焙商（App 里不是必填）。' },
  origin: { type: 'string', description: '产地（当前口径：填国家）。不给就留空，和 App 一致。' },
  process: { type: 'string', description: '处理法。不给就留空，和 App 一致。' },
  country: { type: 'string', description: '产国（产国字段启用时才用）。' },
  region: { type: 'string', description: '产区，大区+细分用空格连接，如 "古吉 罕贝拉"。' },
  estate: { type: 'string', description: '庄园 / 处理厂 / 合作社。' },
  'processing-station': { type: 'string', description: '处理站（仅标签明写处理站时填）。' },
  altitude: { type: 'string', description: '海拔，如 "1920-2020m"。' },
  variety: { type: 'string', description: '品种，多品种用 " / " 连接。' },
  batch: { type: 'string', description: '批次。' },
  percentage: { type: 'string', description: '该成分占比 1-100（拼配用）。' },
  component: {
    type: 'string',
    description:
      '完整成分，可重复：--component "origin=秘鲁;region=卡哈马卡;process=水洗;variety=SL-09;percentage=33"。给了它就不必再给扁平 flag。',
  },
  'roast-level': { type: 'string', description: '烘焙度：极浅烘焙 / 浅度烘焙 / 中浅烘焙 / 中度烘焙 / 中深烘焙 / 深度烘焙（也接受「浅度」这类缩写）。不给就留空，不猜。' },
  'roast-date': { type: 'string', description: '烘焙日期 YYYY-MM-DD（熟豆）。生豆不给这个。' },
  'bean-state': { type: 'string', description: 'roasted（默认，熟豆）或 green（生豆）。生豆记购买日期、没有赏味期。' },
  'purchase-date': { type: 'string', description: '购买日期 YYYY-MM-DD（生豆；不给就填今天）。' },
  'in-transit': { type: 'boolean', description: '标记为在途（还没到手）。与 --is-frozen 互斥。' },
  'is-frozen': { type: 'boolean', description: '标记为冷冻保存。与 --in-transit 互斥。' },
  price: { type: 'string', description: '整包价格（元），只收数字，如 88 或 88.5。' },
  capacity: { type: 'string' },
  'bean-type': { type: 'string', description: 'filter / espresso / omni，默认 filter。' },
  flavor: { type: 'string' },
  notes: { type: 'string' },
  'start-day': { type: 'string', description: '养豆期结束的天数；默认取 App 里的赏味期设置（烘焙商配置 → 全局自定义 → 预设浅 7 / 中 10 / 深 14）。' },
  'end-day': { type: 'string', description: '赏味期结束的天数；默认取 App 里的赏味期设置（烘焙商配置 → 全局自定义 → 预设浅 60 / 中 60 / 深 90）。' },
  'dry-run': { type: 'boolean' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Create a coffee bean record.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['bean', 'add'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'bean add');
    const dryRun = args['dry-run'] === true;
    const jsonFormat = args.format === 'json';

    // 赏味期没显式给、又不是生豆时才去读设置：省掉一次请求，也让「给了 --start-day」的人
    // 不因为读不到设置而被拖慢。
    const beanStateArg =
      typeof args['bean-state'] === 'string' && args['bean-state'].trim()
        ? args['bean-state'].trim().toLowerCase()
        : 'roasted';
    const periodFlagsGiven = args['start-day'] !== undefined || args['end-day'] !== undefined;
    let flavorSettings: FlavorPeriodSettings | undefined;
    if (!periodFlagsGiven && beanStateArg !== 'green') {
      flavorSettings = await loadFlavorPeriodSettings();
      if (!flavorSettings && !dryRun) {
        warn('Warning: 读不到 App 里的赏味期设置，按兜底预设填写（浅 7/60、中 10/60、深 14/90）。');
      }
    }

    const beanData = buildBeanData(
      args as Record<string, string | boolean | string[] | undefined>,
      flavorSettings,
    );

    if (dryRun) {
      if (jsonFormat) {
        printJson({ dryRun: true, bean: beanData });
        await logger.success();
        return;
      }

      console.log(`[dry-run] Would create bean:\n${JSON.stringify(beanData, null, 2)}`);
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const { id, timestamp } = await upsertBeanRecord(supabase, config, beanData);

      if (jsonFormat) {
        printJson({ id, status: 'created', timestamp });
        await logger.success();
        return;
      }

      console.log(`Created bean ${id}`);
      await logger.success();
    } catch (error) {
      await logger.error(error);
      const message = error instanceof Error ? error.message : String(error);
      if (/Missing|Config error/i.test(message)) {
        exitWithError(`Error: Config ${message}`, EXIT.CONFIG);
      }
      if (/^Failed to (upsert|list|fetch|get)/i.test(message)) {
        exitWithError(`Error: Network ${message}`, EXIT.NETWORK);
      }
      exitWithError(`Error: ${message}`, EXIT.FAILURE);
    }
  },
});

