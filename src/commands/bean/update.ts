import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import {
  assertComponentsUsable,
  buildBlendComponents,
  componentFromFlags,
} from '../../lib/blendComponents.ts';
import { updateBean } from '../../services/beans.ts';

function exitWithError(message: string, code: number) {
  console.error(message);
  process.exit(code);
}

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Update a coffee bean\'s fields.',
  },
  args: {
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
    'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
    format: { type: 'string' },
  },
  async run({ args }) {
    const logger = createCommandLogger(['bean', 'update'], args as Record<string, unknown>);

    const updates: Record<string, unknown> = {};
    if (typeof args.name === 'string') updates.name = args.name;
    if (typeof args.roaster === 'string') updates.roaster = args.roaster;
    if (typeof args['roast-level'] === 'string') updates.roastLevel = args['roast-level'];
    if (typeof args.capacity === 'string') updates.capacity = args.capacity;
    if (typeof args.remaining === 'string') updates.remaining = args.remaining;
    if (typeof args.price === 'string') updates.price = args.price;
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
        console.error('Error: --component-index 必须是从 1 开始的整数。');
        process.exit(2);
      }
      updates.componentIndex = rawIndex - 1;
    } else if (typeof args['component-index'] === 'string') {
      console.error('Error: --component-index 要配合成分字段（--origin / --region / --altitude …）使用。');
      process.exit(2);
    }
    if (typeof args['roast-date'] === 'string' && args['roast-date']) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args['roast-date'])) {
        console.error('Error: --roast-date must be YYYY-MM-DD.');
        process.exit(2);
      }
      updates.roastDate = args['roast-date'];
      updates.isInTransit = false;
    }
    if (typeof args['start-day'] === 'string' && args['start-day']) {
      const n = Number(args['start-day']);
      if (!Number.isFinite(n) || n < 0) {
        console.error('Error: --start-day must be a non-negative number.');
        process.exit(2);
      }
      updates.startDay = n;
    }
    if (typeof args['end-day'] === 'string' && args['end-day']) {
      const n = Number(args['end-day']);
      if (!Number.isFinite(n) || n < 0) {
        console.error('Error: --end-day must be a non-negative number.');
        process.exit(2);
      }
      updates.endDay = n;
    }

    if (Object.keys(updates).length === 0) {
      console.error('No fields to update. Use --name, --roaster, etc.');
      process.exit(2);
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
        console.error(`Bean ${args.id} not found.`);
        await logger.error(`Bean ${args.id} not found`);
        process.exit(1);
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
      exitWithError(`Error: ${message}`, 1);
    }
  },
});
