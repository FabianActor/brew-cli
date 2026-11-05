import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { EXIT, exitForError, exitWithError } from '../../lib/exit.ts';
import { formatFields, printJson, warn, warnMaybeMore } from '../../lib/output.ts';
import { listSummaries, type JsonbFilter } from '../../lib/query.ts';

/**
 * 冲煮时间：`data.timestamp` 是 unix ms（App 写的），缺失时退回行上的 `updated_at`。
 * 输出沿用 ISO 字符串，和以前看起来一样。
 */
function brewedAt(record: Record<string, unknown>): string | undefined {
  const timestamp = record.timestamp;
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }
  const updatedAt = record.updated_at;
  return typeof updatedAt === 'string' ? updatedAt : undefined;
}

function printHumanRecords(records: Array<Record<string, unknown>>) {
  for (const record of records) {
    console.log(
      formatFields([
        record.id,
        record.method,
        record.equipment,
        record.beanId,
        record.rating ?? record.score,
        record.notes ?? record.flavor,
        brewedAt(record),
      ]),
    );
  }
}

/**
 * `--from/--to` 接受 `YYYY-MM-DD` 或 ISO 时间，换算成 unix ms。
 * `--from` 取当天 00:00，`--to` 取当天 23:59:59.999（都是本地时区），符合"按天筛"的直觉。
 */
function parseDateBound(value: string, flag: string, edge: 'start' | 'end'): number {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}`
    : value;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    exitWithError(`Error: ${flag} 不是有效日期（用 YYYY-MM-DD 或 ISO 时间）。`, EXIT.USAGE);
  }
  return parsed.getTime();
}

const argsDef = {
  limit: { type: 'string', default: '20' },
  equipment: { type: 'string', description: 'Filter by equipment id.' },
  method: { type: 'string', description: 'Filter by method name (substring, case-insensitive).' },
  'bean-id': { type: 'string', description: 'Filter by bean id.' },
  'min-rating': { type: 'string', description: 'Only notes with rating >= N (0-5).' },
  from: { type: 'string', description: '起始日期（YYYY-MM-DD 或 ISO），含当天。' },
  to: { type: 'string', description: '结束日期（YYYY-MM-DD 或 ISO），含当天。' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List brewing notes.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['note', 'list'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'note list');

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

    const fromMs = typeof args.from === 'string' && args.from ? parseDateBound(args.from, '--from', 'start') : undefined;
    const toMs = typeof args.to === 'string' && args.to ? parseDateBound(args.to, '--to', 'end') : undefined;
    if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) {
      exitWithError('Error: --from 不能晚于 --to。', EXIT.USAGE);
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

    const needsLocalFilter = minRating != null || fromMs !== undefined || toMs !== undefined;

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);

      const { rows, truncated } = await listSummaries(supabase, {
        table: 'brewing_notes',
        userId: config.brewGuideUserId,
        limit,
        filters,
        predicate: needsLocalFilter
          ? (data) => {
              if (minRating != null) {
                const rating = typeof data.rating === 'number' ? data.rating : 0;
                if (rating < minRating) return false;
              }
              // timestamp 在 data 里是 unix ms；缺失时退回行上的 updated_at 不做判断
              const timestamp = typeof data.timestamp === 'number' ? data.timestamp : undefined;
              if (timestamp !== undefined) {
                if (fromMs !== undefined && timestamp < fromMs) return false;
                if (toMs !== undefined && timestamp > toMs) return false;
              }
              return true;
            }
          : undefined,
      });

      if (truncated) {
        warn('Warning: scanned a lot of rows without filling --limit; result may be partial.');
      }

      if (args.format === 'json') {
        printJson(rows);
        await logger.success();
        return;
      }

      if (rows.length === 0) {
        console.log("No notes found. Use 'brew-guide note add' to create one.");
        await logger.success();
        return;
      }

      printHumanRecords(rows);
      warnMaybeMore(rows.length, limit);
      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
