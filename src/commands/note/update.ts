import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags, nonEmptyString } from '../../lib/args.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { parseRating, parseTemperature } from '../../lib/noteInput.ts';
import { printJson } from '../../lib/output.ts';
import { updateNote } from '../../services/notes.ts';
import { readImageAsDataUrl } from '../../lib/imageFile.ts';

/** 解析 0-5 的评分字段，非法时直接按用法错误退出。 */
function parseScore(value: unknown, flag: string): number | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.trim() === '') {
    exitWithError(`Error: ${flag} 不能是空字符串（想去掉评分请用 --rating 给 0）`, EXIT.USAGE);
  }
  return parseRating(value, flag);
}

const argsDef = {
  id: { type: 'positional', required: true, description: 'Note record ID.' },
  rating: { type: 'string', description: 'Rating 0-5 (accepts decimals like 3.5).' },
  method: { type: 'string', description: 'Method name.' },
  memo: { type: 'string', description: 'Tasting notes.' },
  notes: { type: 'string', description: 'Free-form notes (authoritative; alias of --memo).' },
  equipment: { type: 'string', description: 'Equipment row id.' },
  'total-time': { type: 'string', description: 'Total brew time in seconds.' },
  image: { type: 'string', description: '照片（本地文件），存成 data URL；支持 .jpg / .jpeg / .png / .webp / .gif，上限 1.5 MB。' },
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

    // 照片：给文件就换成新图（App 的记录也是把 data URL 存在 data.image 里）。
    if (typeof args.image === 'string' && args.image) {
      try {
        updates.image = readImageAsDataUrl(args.image, '--image');
      } catch (error) {
        exitWithError(`Error: ${error instanceof Error ? error.message : String(error)}`, EXIT.USAGE);
      }
    }

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
      paramsPatch.temp = parseTemperature(args['water-temp']);
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
        printJson({ dryRun: true, action: 'update', id: args.id, updates });
      } else {
        console.log(`[dry-run] Would update note ${args.id}:\n${JSON.stringify(updates, null, 2)}`);
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
        printJson(result);
      } else {
        console.log(`Updated note ${args.id}`);
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
