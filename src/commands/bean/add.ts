import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import {
  assertComponentsUsable,
  buildBlendComponents,
  componentFromFlags,
} from '../../lib/blendComponents.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { warn } from '../../lib/output.ts';
import { flavorPeriodForRoastLevel, normalizeRoastLevel, BEAN_TYPES } from '../../lib/roast.ts';
import { normalizeWeight } from '../../lib/weights.ts';
import { upsertBeanRecord } from '../../tools/upsertBean.ts';

function parseDayArg(value: unknown, fallback: number, flag: string): number {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    exitWithError(`Error: ${flag} must be a non-negative number of days.`, EXIT.USAGE);
  }
  return parsed;
}

function buildBeanData(args: Record<string, string | boolean | string[] | undefined>) {
  const normalizedCapacity = typeof args.capacity === 'string' ? normalizeWeight(args.capacity) : undefined;

  const beanData: Record<string, unknown> = {
    name: args.name,
    roaster: args.roaster,
  };

  const blendComponents = buildBlendComponents(args.component, componentFromFlags(args));
  assertComponentsUsable(blendComponents);

  // 烘焙度：给了就照写（顺手把「浅度」补成「浅度烘焙」），没给就留空。
  // 以前没给时会按 bean-type 猜一个（filter→浅度、espresso→中深），猜错就污染 App 的筛选。
  let roastLevel: string | undefined;
  if (typeof args['roast-level'] === 'string' && args['roast-level']) {
    const normalized = normalizeRoastLevel(args['roast-level']);
    if (normalized.warning) warn(normalized.warning);
    roastLevel = normalized.value;
    beanData.roastLevel = roastLevel;
  }

  // 在途：App 的默认值是「已到手」（BeanListItem.tsx:304 读 `bean.isInTransit || false`），
  // 只有手动点过「设为在途」才是 true。以前没给烘焙日期就写 true，加一颗手上的豆，
  // 卡片上直接显示「在途」。
  beanData.isInTransit = false;
  if (typeof args['roast-date'] === 'string' && args['roast-date']) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args['roast-date'])) {
      exitWithError('Error: --roast-date must be YYYY-MM-DD.', EXIT.USAGE);
    }
    beanData.roastDate = args['roast-date'];
  }
  if (typeof args.price === 'string' && args.price) {
    beanData.price = args.price;
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
  beanData.beanState = 'roasted';
  beanData.isFrozen = false;
  // 赏味期默认值与 App 同源（浅 7/60、中 10/60、深 14/90，烘焙度为空按中烘）。
  // 以前固定 30/60，浅烘豆在 App 里会被算成「养豆期 30 天」，赏味期整段后移。
  const period = flavorPeriodForRoastLevel(roastLevel);
  beanData.startDay = parseDayArg(args['start-day'], period.startDay, '--start-day');
  beanData.endDay = parseDayArg(args['end-day'], period.endDay, '--end-day');

  if (typeof normalizedCapacity === 'string' && normalizedCapacity) {
    beanData.remaining = normalizedCapacity;
  }

  return beanData;
}


const argsDef = {
  name: { type: 'string', required: true },
  roaster: { type: 'string', required: true },
  origin: { type: 'string', description: '产地（当前口径：填国家）。' },
  process: { type: 'string', description: '处理法。' },
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
  'roast-date': { type: 'string' },
  price: { type: 'string' },
  capacity: { type: 'string' },
  'bean-type': { type: 'string', description: 'filter / espresso / omni，默认 filter。' },
  flavor: { type: 'string' },
  notes: { type: 'string' },
  'start-day': { type: 'string', description: '养豆期结束的天数；默认按烘焙度取（浅 7 / 中 10 / 深 14）。' },
  'end-day': { type: 'string', description: '赏味期结束的天数；默认按烘焙度取（浅 60 / 中 60 / 深 90）。' },
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
    const beanData = buildBeanData(args as Record<string, string | boolean | string[] | undefined>);
    const dryRun = args['dry-run'] === true;
    const jsonFormat = args.format === 'json';

    if (dryRun) {
      if (jsonFormat) {
        console.log(JSON.stringify({ dryRun: true, bean: beanData }));
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
        console.log(JSON.stringify({ id, status: 'created', timestamp }));
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

