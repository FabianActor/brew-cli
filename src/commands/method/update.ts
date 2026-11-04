import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags, nonEmptyString } from '../../lib/args.ts';
import { EXIT, exitForError, exitWithError } from '../../lib/exit.ts';
import { printJson } from '../../lib/output.ts';
import { updateMethod } from '../../services/methods.ts';

const argsDef = {
  id: { type: 'positional', required: true, description: 'Method ID.' },
  name: { type: 'string', description: 'Method name.' },
  coffee: { type: 'string', description: 'Coffee amount (e.g. "15g").' },
  water: { type: 'string', description: 'Water amount (e.g. "225g").' },
  ratio: { type: 'string', description: 'Brew ratio (e.g. "1:15").' },
  'grind-size': { type: 'string', description: 'Grind size.' },
  temp: { type: 'string', description: 'Water temp (e.g. "92°C").' },
  'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Update a brewing method.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['method', 'update'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'method update');

    const updates: Record<string, unknown> = {};
    const name = nonEmptyString(args.name, '--name', '要改名字请给具体值');
    if (name !== undefined) updates.name = name;

    const paramUpdates: Record<string, unknown> = {};
    if (typeof args.coffee === 'string' && args.coffee) paramUpdates.coffee = args.coffee;
    if (typeof args.water === 'string' && args.water) paramUpdates.water = args.water;
    if (typeof args.ratio === 'string' && args.ratio) paramUpdates.ratio = args.ratio;
    if (typeof args['grind-size'] === 'string' && args['grind-size']) paramUpdates.grindSize = args['grind-size'];
    if (typeof args.temp === 'string' && args.temp) paramUpdates.temp = args.temp;
    if (Object.keys(paramUpdates).length > 0) {
      updates.params = paramUpdates;
    }

    if (Object.keys(updates).length === 0) {
      exitWithError('No fields to update. Use --name, --coffee, --water, --ratio, --grind-size, --temp.', EXIT.USAGE);
    }

    if (args['dry-run']) {
      if (args.format === 'json') {
        printJson({ dryRun: true, action: 'update', id: args.id, updates });
      } else {
        console.log(`[dry-run] Would update method ${args.id.slice(0, 8)}:\n${JSON.stringify(updates, null, 2)}`);
      }
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const result = await updateMethod(supabase, args.id, updates, config.brewGuideUserId);

      if (!result) {
        await logger.error(`Method ${args.id} not found`);
        exitWithError(`Method ${args.id} not found.`, EXIT.FAILURE);
      }

      if (args.format === 'json') {
        printJson(result);
      } else {
        console.log(`Updated method: ${result.name ?? args.id}`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
