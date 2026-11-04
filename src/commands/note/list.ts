import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { listSummaries, type JsonbFilter } from '../../lib/query.ts';

function printHumanRecords(records: Array<Record<string, unknown>>) {
  for (const record of records) {
    const fields = [
      record.id,
      record.method,
      record.equipment,
      record.beanId,
      record.rating ?? record.score,
      record.notes ?? record.flavor,
      record.updated_at,
    ].filter((value) => value !== undefined && value !== null && value !== '');
    console.log(fields.join(' | '));
  }
}

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List brewing notes.',
  },
  args: {
    limit: { type: 'string', default: '20' },
    equipment: { type: 'string', description: 'Filter by equipment id.' },
    method: { type: 'string', description: 'Filter by method name (substring, case-insensitive).' },
    'bean-id': { type: 'string', description: 'Filter by bean id.' },
    'min-rating': { type: 'string', description: 'Only notes with rating >= N (0-5).' },
    format: { type: 'string' },
  },
  async run({ args }) {
    const logger = createCommandLogger(['note', 'list'], args as Record<string, unknown>);
    const limit = Number.parseInt(String(args.limit), 10);
    if (Number.isNaN(limit) || limit <= 0) {
      await logger.error('Error: --limit must be a positive integer');
      exitWithError('Error: --limit must be a positive integer', EXIT.USAGE);
    }

    let minRating: number | undefined;
    if (typeof args['min-rating'] === 'string' && args['min-rating']) {
      const parsed = Number.parseFloat(args['min-rating']);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) {
        exitWithError('Error: --min-rating must be a number between 0 and 5.', EXIT.USAGE);
      }
      minRating = parsed;
    }

    const filters: JsonbFilter[] = [];
    if (typeof args.equipment === 'string' && args.equipment) {
      filters.push({ key: 'equipment', value: args.equipment });
    }
    if (typeof args.method === 'string' && args.method) {
      // ilike 用 %…% 做不区分大小写的子串匹配，和之前本地 includes 的行为一致。
      filters.push({ key: 'method', op: 'ilike', value: `%${args.method}%` });
    }
    if (typeof args['bean-id'] === 'string' && args['bean-id']) {
      filters.push({ key: 'beanId', value: args['bean-id'] });
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);

      const { rows, truncated } = await listSummaries(supabase, {
        table: 'brewing_notes',
        userId: config.brewGuideUserId,
        limit,
        filters,
        predicate:
          minRating == null
            ? undefined
            : (data) => {
                const rating = typeof data.rating === 'number' ? data.rating : 0;
                return rating >= minRating;
              },
      });

      if (truncated) {
        process.stderr.write('Warning: scanned a lot of rows without filling --limit; result may be partial.\n');
      }

      if (rows.length === 0) {
        if (args.format === 'json') {
          console.log(JSON.stringify([]));
        } else {
          console.log("No notes found. Use 'brew-guide note add' to create one.");
        }
        await logger.success();
        return;
      }

      if (args.format === 'json') {
        console.log(JSON.stringify(rows));
      } else {
        printHumanRecords(rows);
      }
      await logger.success();
    } catch (error) {
      await logger.error(error);
      const message = error instanceof Error ? error.message : String(error);
      if (/Missing|Config error/i.test(message)) {
        exitWithError(`Error: Config ${message}`, EXIT.CONFIG);
      }
      if (/^Failed to list records/i.test(message)) {
        exitWithError(`Error: Network ${message}`, EXIT.NETWORK);
      }
      exitWithError(`Error: ${message}`, EXIT.FAILURE);
    }
  },
});
