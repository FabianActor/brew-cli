import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags, nonEmptyString } from '../../lib/args.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { updateNote } from '../../services/notes.ts';

/** 解析 0-5 的评分字段，非法时直接按用法错误退出。 */
function parseScore(value: unknown, flag: string): number | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.trim() === '') {
    exitWithError(`Error: ${flag} 不能是空字符串（想去掉评分请用 --rating 给 0）`, EXIT.USAGE);
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) {
    exitWithError(`Error: ${flag} must be a number between 0 and 5.`, EXIT.USAGE);
  }
  return parsed;
}

const argsDef = {
  id: { type: 'positional', required: true, description: 'Note record ID.' },
  rating: { type: 'string', description: 'Rating 0-5 (accepts decimals like 3.5).' },
  method: { type: 'string', description: 'Method name.' },
  memo: { type: 'string', description: 'Tasting notes.' },
  notes: { type: 'string', description: 'Free-form notes (authoritative; alias of --memo).' },
  equipment: { type: 'string', description: 'Equipment row id.' },
  'total-time': { type: 'string', description: 'Total brew time in seconds.' },
  source: { type: 'string', description: 'Source tag.' },
  ratio: { type: 'string', description: 'params.ratio.' },
  'grind-size': { type: 'string', description: 'params.grindSize.' },
  'water-temp': { type: 'string', description: 'params.temp °C.' },
  coffee: { type: 'string', description: 'params.coffee.' },
  water: { type: 'string', description: 'params.water.' },
  'taste-body': { type: 'string', description: 'Taste body 0-5.' },
  'taste-acidity': { type: 'string', description: 'Taste acidity 0-5.' },
  'taste-sweetness': { type: 'string', description: 'Taste sweetness 0-5.' },
  'taste-bitterness': { type: 'string', description: 'Taste bitterness 0-5.' },
  'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Update a brewing note.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['note', 'update'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'note update');

    const updates: Record<string, unknown> = {};

    const rating = parseScore(args.rating, '--rating');
    if (rating !== undefined) updates.rating = rating;

    const method = nonEmptyString(args.method, '--method');
    if (method !== undefined) updates.method = method;
    const equipment = nonEmptyString(args.equipment, '--equipment');
    if (equipment !== undefined) updates.equipment = equipment;

    // notes 允许显式清空：--notes "" 就是"清掉备注"，这是唯一合法的空字符串。
    if (typeof args.notes === 'string') updates.notes = args.notes;
    else if (typeof args.memo === 'string') updates.notes = args.memo;

    if (typeof args['total-time'] === 'string' && args['total-time']) {
      const totalTime = Number.parseFloat(args['total-time']);
      if (!Number.isFinite(totalTime) || totalTime < 0) {
        exitWithError('Error: --total-time must be a non-negative number (seconds).', EXIT.USAGE);
      }
      updates.totalTime = totalTime;
    }

    const source = nonEmptyString(args.source, '--source');
    if (source !== undefined) updates.source = source;

    const paramsPatch: Record<string, unknown> = {};
    const ratio = nonEmptyString(args.ratio, '--ratio');
    if (ratio !== undefined) paramsPatch.ratio = ratio;
    const grindSize = nonEmptyString(args['grind-size'], '--grind-size');
    if (grindSize !== undefined) paramsPatch.grindSize = grindSize;
    if (typeof args['water-temp'] === 'string' && args['water-temp']) {
      const temp = Number.parseFloat(args['water-temp']);
      if (!Number.isFinite(temp)) {
        exitWithError('Error: --water-temp must be a number.', EXIT.USAGE);
      }
      paramsPatch.temp = `${temp}°C`;
    }
    const coffee = nonEmptyString(args.coffee, '--coffee');
    if (coffee !== undefined) paramsPatch.coffee = coffee;
    const water = nonEmptyString(args.water, '--water');
    if (water !== undefined) paramsPatch.water = water;
    if (Object.keys(paramsPatch).length > 0) updates.params = paramsPatch;

    const taste: Record<string, number> = {};
    for (const key of ['body', 'acidity', 'sweetness', 'bitterness'] as const) {
      const parsed = parseScore((args as Record<string, unknown>)[`taste-${key}`], `--taste-${key}`);
      if (parsed !== undefined) taste[key] = parsed;
    }
    if (Object.keys(taste).length > 0) updates.taste = taste;

    if (Object.keys(updates).length === 0) {
      exitWithError('No fields to update. Use --rating, --method, --memo, --notes, --equipment.', EXIT.USAGE);
    }

    if (args['dry-run']) {
      if (args.format === 'json') {
        console.log(JSON.stringify({ dryRun: true, action: 'update', id: args.id, updates }));
      } else {
        console.log(`[dry-run] Would update note ${args.id.slice(0, 8)}:\n${JSON.stringify(updates, null, 2)}`);
      }
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const result = await updateNote(supabase, args.id, updates, config.brewGuideUserId);

      if (!result) {
        await logger.error(`Note ${args.id} not found`);
        exitWithError(`Note ${args.id} not found.`, EXIT.FAILURE);
      }

      if (args.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Updated note ${args.id.slice(0, 8)}`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      const message = error instanceof Error ? error.message : String(error);
      if (/Missing|Config error/i.test(message)) {
        exitWithError(`Error: Config ${message}`, EXIT.CONFIG);
      }
      if (/^Failed to (update|list|fetch|get)/i.test(message)) {
        exitWithError(`Error: Network ${message}`, EXIT.NETWORK);
      }
      exitWithError(`Error: ${message}`, EXIT.FAILURE);
    }
  },
});
