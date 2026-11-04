import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags, nonEmptyString } from '../../lib/args.ts';
import {
  assertComponentsUsable,
  buildBlendComponents,
  componentFromFlags,
} from '../../lib/blendComponents.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { normalizeWeight } from '../../lib/weights.ts';
import { updateBean } from '../../services/beans.ts';

const argsDef = {
id: { type: 'positional', required: true, description: 'Bean record ID.' },
  name: { type: 'string', description: 'Bean name.' },
  roaster: { type: 'string', description: 'Roaster name.' },
  'roast-level': { type: 'string', description: 'Roast level.' },
  capacity: { type: 'string', description: 'Total capacity.' },
  remaining: { type: 'string', description: 'Remaining amount.' },
  price: { type: 'string', description: 'Price.' },
  notes: { type: 'string', description: 'Notes.' },
  origin: { type: 'string', description: '产地（写进 blendComponents[--component-index]，编号从 1 开始）。' },
  process: { type: 'string', description: '处理法。' },
  country: { type: 'string', description: '产国。' },
  region: { type: 'string', description: '产区，如 "古吉 罕贝拉"。' },
  estate: { type: 'string', description: '庄园 / 处理厂 / 合作社。' },
  'processing-station': { type: 'string', description: '处理站。' },
  altitude: { type: 'string', description: '海拔，如 "1920-2020m"。' },
  variety: { type: 'string', description: '品种。' },
  batch: { type: 'string', description: '批次。' },
  percentage: { type: 'string', description: '成分占比 1-100。' },
  'component-index': { type: 'string', description: '改第几个成分，编号从 1 开始（默认 1）。' },
  component: {
    type: 'string',
    description:
      '整组替换成分，可重复：--component "origin=秘鲁;percentage=33" --component "origin=巴西;percentage=67"。',
  },
  'roast-date': { type: 'string', description: 'Roast date (YYYY-MM-DD).' },
  'start-day': { type: 'string', description: 'Optimal start day after roast.' },
  'end-day': { type: 'string', description: 'Optimal end day after roast.' },
  'bean-type': { type: 'string', description: '豆种：filter / espresso / omni。' },
  flavor: { type: 'string', description: '风味，逗号分隔，如 "花香,莓果"。' },
  'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Update a coffee bean\'s fields.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['bean', 'update'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'bean update');

    const updates: Record<string, unknown> = {};
    const name = nonEmptyString(args.name, '--name', '要改名字请给具体值');
    if (name !== undefined) updates.name = name;
    const roasterName = nonEmptyString(args.roaster, '--roaster');
    if (roasterName !== undefined) updates.roaster = roasterName;
    const roastLevel = nonEmptyString(args['roast-level'], '--roast-level');
    if (roastLevel !== undefined) updates.roastLevel = roastLevel;
    const beanType = nonEmptyString(args['bean-type'], '--bean-type');
    if (beanType !== undefined) updates.beanType = beanType;
    const flavorRaw = nonEmptyString(args.flavor, '--flavor');
    if (flavorRaw !== undefined) {
      updates.flavor = flavorRaw
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    const capacity = nonEmptyString(normalizeWeight(args.capacity), '--capacity', '用 150 或 150g');
    if (capacity !== undefined) updates.capacity = capacity;
    const remaining = nonEmptyString(normalizeWeight(args.remaining), '--remaining', '用 120 或 120g');
    if (remaining !== undefined) updates.remaining = remaining;
    const price = nonEmptyString(args.price, '--price');
    if (price !== undefined) updates.price = price;
    // notes 允许显式清空：--notes "" 视为"清掉备注"，这是唯一合法的空值。
    if (typeof args.notes === 'string') updates.notes = args.notes;
    const componentSpecs = Array.isArray(args.component)
      ? args.component
      : typeof args.component === 'string' && args.component
        ? [args.component]
        : [];
    const componentFlags = componentFromFlags(args as Record<string, unknown>);

    if (componentSpecs.length > 0) {
      const components = buildBlendComponents(componentSpecs, {});
      assertComponentsUsable(components);
      updates.blendComponents = components;
    } else if (Object.keys(componentFlags).length > 0) {
      Object.assign(updates, componentFlags);
      const rawIndex = typeof args['component-index'] === 'string' ? Number(args['component-index']) : 1;
      if (!Number.isInteger(rawIndex) || rawIndex < 1) {
        exitWithError('Error: --component-index 必须是从 1 开始的整数。', EXIT.USAGE);
      }
      updates.componentIndex = rawIndex - 1;
    } else if (typeof args['component-index'] === 'string') {
      exitWithError('Error: --component-index 要配合成分字段（--origin / --region / --altitude …）使用。', EXIT.USAGE);
    }
    if (typeof args['roast-date'] === 'string' && args['roast-date']) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args['roast-date'])) {
        exitWithError('Error: --roast-date must be YYYY-MM-DD.', EXIT.USAGE);
      }
      updates.roastDate = args['roast-date'];
      updates.isInTransit = false;
    }
    if (typeof args['start-day'] === 'string' && args['start-day']) {
      const n = Number(args['start-day']);
      if (!Number.isFinite(n) || n < 0) {
        exitWithError('Error: --start-day must be a non-negative number.', EXIT.USAGE);
      }
      updates.startDay = n;
    }
    if (typeof args['end-day'] === 'string' && args['end-day']) {
      const n = Number(args['end-day']);
      if (!Number.isFinite(n) || n < 0) {
        exitWithError('Error: --end-day must be a non-negative number.', EXIT.USAGE);
      }
      updates.endDay = n;
    }

    if (Object.keys(updates).length === 0) {
      exitWithError('No fields to update. Use --name, --roaster, etc.', EXIT.USAGE);
    }

    if (args['dry-run']) {
      if (args.format === 'json') {
        console.log(JSON.stringify({ dryRun: true, action: 'update', id: args.id, updates }));
      } else {
        console.log(`[dry-run] Would update bean ${args.id.slice(0, 8)}:\n${JSON.stringify(updates, null, 2)}`);
      }
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const result = await updateBean(supabase, args.id, updates, config.brewGuideUserId);

      if (!result) {
        await logger.error(`Bean ${args.id} not found`);
        exitWithError(`Bean ${args.id} not found.`, EXIT.FAILURE);
      }

      if (args.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Updated bean: ${result.name ?? args.id}`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      const message = error instanceof Error ? error.message : String(error);
      exitWithError(`Error: ${message}`, EXIT.FAILURE);
    }
  },
});

