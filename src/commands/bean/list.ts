import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { listSummaries, type JsonbFilter } from '../../lib/query.ts';
import { parseGrams } from '../../lib/weights.ts';

function printHumanRecords(records: Array<Record<string, unknown>>) {
  for (const record of records) {
    const fields = [
      record.id,
      record.name,
      record.roaster,
      record.region ?? record.origin,
      record.process,
      record.remaining !== undefined && record.remaining !== '' ? `${record.remaining}g` : undefined,
      record.updated_at,
    ].filter((value) => value !== undefined && value !== null && value !== '');
    console.log(fields.join(' | '));
  }
}

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List coffee beans.',
  },
  args: {
    limit: { type: 'string', default: '20' },
    'roast-level': { type: 'string', description: 'Filter by roast level.' },
    'bean-type': { type: 'string', description: 'Filter by bean type (filter / espresso).' },
    'has-remaining': { type: 'string', description: 'Only beans with remaining > 0: true / false.' },
    format: { type: 'string' },
  },
  async run({ args }) {
    const logger = createCommandLogger(['bean', 'list'], args as Record<string, unknown>);
    const limit = Number.parseInt(String(args.limit), 10);
    if (Number.isNaN(limit) || limit <= 0) {
      await logger.error('Error: --limit must be a positive integer');
      exitWithError('Error: --limit must be a positive integer', EXIT.USAGE);
    }

    let hasRemaining: boolean | undefined;
    if (typeof args['has-remaining'] === 'string' && args['has-remaining']) {
      const value = args['has-remaining'].toLowerCase();
      if (value !== 'true' && value !== 'false') {
        exitWithError('Error: --has-remaining must be "true" or "false".', EXIT.USAGE);
      }
      hasRemaining = value === 'true';
    }

    const filters: JsonbFilter[] = [];
    if (typeof args['roast-level'] === 'string' && args['roast-level']) {
      filters.push({ key: 'roastLevel', value: args['roast-level'] });
    }
    if (typeof args['bean-type'] === 'string' && args['bean-type']) {
      filters.push({ key: 'beanType', value: args['bean-type'] });
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);

      const { rows, truncated } = await listSummaries(supabase, {
        table: 'coffee_beans',
        userId: config.brewGuideUserId,
        limit,
        filters,
        predicate:
          hasRemaining === undefined ? undefined : (data) => {
            const grams = parseGrams(data.remaining);
            return hasRemaining ? grams > 0 : grams <= 0;
          },
      });

      if (truncated) {
        process.stderr.write('Warning: scanned a lot of rows without filling --limit; result may be partial.\n');
      }

      if (rows.length === 0) {
        if (args.format === 'json') {
          console.log(JSON.stringify([]));
        } else {
          console.log("No beans found. Use 'brew-guide bean add' to create one.");
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
