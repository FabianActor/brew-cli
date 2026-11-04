import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import {
  assertComponentsUsable,
  buildBlendComponents,
  componentFromFlags,
} from '../../lib/blendComponents.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { normalizeWeight } from '../../lib/weights.ts';
import { upsertBeanRecord } from '../../tools/upsertBean.ts';


function buildBeanData(args: Record<string, string | boolean | string[] | undefined>) {
  const normalizedCapacity = typeof args.capacity === 'string' ? normalizeWeight(args.capacity) : undefined;

  const beanData: Record<string, unknown> = {
    name: args.name,
    roaster: args.roaster,
  };

  const blendComponents = buildBlendComponents(args.component, componentFromFlags(args));
  assertComponentsUsable(blendComponents);

  if (typeof args['roast-level'] === 'string' && args['roast-level']) {
    beanData.roastLevel = args['roast-level'];
  }
  if (typeof args['roast-date'] === 'string' && args['roast-date']) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args['roast-date'])) {
      exitWithError('Error: --roast-date must be YYYY-MM-DD.', EXIT.USAGE);
    }
    beanData.roastDate = args['roast-date'];
    beanData.isInTransit = false;
  } else {
    beanData.isInTransit = true;
  }
  if (typeof args.price === 'string' && args.price) {
    beanData.price = args.price;
  }
  if (typeof normalizedCapacity === 'string' && normalizedCapacity) {
    beanData.capacity = normalizedCapacity;
  }
  beanData.beanType = typeof args['bean-type'] === 'string' && args['bean-type'] ? args['bean-type'] : 'filter';
  if (!beanData.roastLevel && beanData.beanType === 'filter') {
    beanData.roastLevel = '浅度烘焙';
  }
  if (!beanData.roastLevel && beanData.beanType === 'espresso') {
    beanData.roastLevel = '中深烘焙';
  }
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
  const startDay = typeof args['start-day'] === 'string' && args['start-day'] ? Number(args['start-day']) : 30;
  const endDay = typeof args['end-day'] === 'string' && args['end-day'] ? Number(args['end-day']) : 60;
  beanData.startDay = Number.isFinite(startDay) ? startDay : 30;
  beanData.endDay = Number.isFinite(endDay) ? endDay : 60;

  if (typeof normalizedCapacity === 'string' && normalizedCapacity) {
    beanData.remaining = normalizedCapacity;
  }

  return beanData;
}


export default defineCommand({
  meta: {
    name: 'add',
    description: 'Create a coffee bean record.',
  },
  args: {
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
    'roast-level': { type: 'string' },
    'roast-date': { type: 'string' },
    price: { type: 'string' },
    capacity: { type: 'string' },
    'bean-type': { type: 'string' },
    flavor: { type: 'string' },
    notes: { type: 'string' },
    'start-day': { type: 'string', description: 'Optimal start day after roast (default 30).' },
    'end-day': { type: 'string', description: 'Optimal end day after roast (default 60).' },
    'dry-run': { type: 'boolean' },
    format: { type: 'string' },
  },
  async run({ args }) {
    const logger = createCommandLogger(['bean', 'add'], args as Record<string, unknown>);
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

