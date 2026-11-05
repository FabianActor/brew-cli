import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { EXIT, exitForError, exitWithError } from '../../lib/exit.ts';
import { formatFields, printJson, warn, warnMaybeMore } from '../../lib/output.ts';
import { listSummaries, type JsonbFilter } from '../../lib/query.ts';
import { parseGrams } from '../../lib/weights.ts';

function printHumanRecords(records: Array<Record<string, unknown>>) {
  for (const record of records) {
    const remaining =
      record.remaining !== undefined && record.remaining !== '' ? `${record.remaining}g` : undefined;
    console.log(
      formatFields([
        record.id,
        record.name,
        record.roaster,
        record.region ?? record.origin,
        record.process,
        remaining,
        record.updated_at,
      ]),
    );
  }
}

const argsDef = {
  limit: { type: 'string', default: '20' },
  'roast-level': { type: 'string', description: 'Filter by roast level.' },
  'bean-type': { type: 'string', description: 'Filter by bean type (filter / espresso).' },
  region: { type: 'string', description: '按产区筛（包含匹配，如 "古吉"）。' },
  process: { type: 'string', description: '按处理法筛（包含匹配，如 "日晒"）。' },
  variety: { type: 'string', description: '按品种筛（包含匹配，如 "74158"）。' },
  country: { type: 'string', description: '按产国筛（包含匹配，如 "Ethiopia"）；产国字段空时回落到产地。' },
  batch: { type: 'string', description: '按批次筛（包含匹配，如 "Lot 26"）。' },
  roaster: { type: 'string', description: '按烘焙商筛（包含匹配）。' },
  'has-remaining': {
    type: 'string',
    description:
      '按余量筛：true 只看还有余量的，false 只看余量为 0 的。必须带取值，裸写不会生效。',
  },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List coffee beans.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['bean', 'list'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'bean list');

    const limit = Number.parseInt(String(args.limit), 10);
    if (Number.isNaN(limit) || limit <= 0) {
      await logger.error('Error: --limit must be a positive integer');
      exitWithError('Error: --limit must be a positive integer', EXIT.USAGE);
    }

    let hasRemaining: boolean | undefined;
    if ('has-remaining' in args && args['has-remaining'] !== undefined) {
      const value = String(args['has-remaining']).trim().toLowerCase();
      if (value !== 'true' && value !== 'false') {
        // 裸写 --has-remaining 以前是静默忽略（看着像筛过了），现在直接停在用法错误上。
        exitWithError(
          `Error: --has-remaining 需要取值：true（只看还有余量的）或 false（只看余量为 0 的），收到 "${value}"。`,
          EXIT.USAGE,
        );
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
    // 烘焙商在 data 顶层，可以下推
    if (typeof args.roaster === 'string' && args.roaster) {
      filters.push({ key: 'roaster', op: 'ilike', value: `%${args.roaster}%` });
    }

    // 产区/处理法/品种/产国/批次躺在 data.blendComponents[] 里，PostgREST 的 data->>key 够不着，
    // 只能在本地逐条判断（包含匹配，因为库里存的是「古吉 罕贝拉」这种大区+细分）。
    // --country 额外认 origin：按现在的填写口径，国家是写在产地里的（产国字段多数人没开），
    // 只认 country 会让「--country 埃塞俄比亚」在正常库里一款都筛不出来。
    const COMPONENT_ALIASES: Record<string, readonly string[]> = {
      country: ['country', 'origin'],
    };
    const componentFilters = (['region', 'process', 'variety', 'country', 'batch'] as const)
      .map((key) => ({ key, needle: typeof args[key] === 'string' ? String(args[key]).trim() : '' }))
      .filter((entry) => entry.needle !== '');

    const matchesComponents = (data: Record<string, unknown>) => {
      if (componentFilters.length === 0) return true;
      const components = Array.isArray(data.blendComponents) ? data.blendComponents : [];
      return componentFilters.every(({ key, needle }) => {
        const keys = COMPONENT_ALIASES[key] ?? [key];
        const haystack = components.length > 0 ? components : [data];
        return haystack.some((component) => {
          if (!component || typeof component !== 'object') return false;
          const record = component as Record<string, unknown>;
          return keys.some((field) => {
            const value = record[field];
            return typeof value === 'string' && value.toLowerCase().includes(needle.toLowerCase());
          });
        });
      });
    };

    const needsPredicate = hasRemaining !== undefined || componentFilters.length > 0;

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);

      const { rows, truncated } = await listSummaries(supabase, {
        table: 'coffee_beans',
        userId: config.brewGuideUserId,
        limit,
        filters,
        predicate: needsPredicate
          ? (data) => {
              if (!matchesComponents(data)) return false;
              if (hasRemaining === undefined) return true;
              const grams = parseGrams(data.remaining);
              return hasRemaining ? grams > 0 : grams <= 0;
            }
          : undefined,
      });

      if (truncated) {
        warn('Warning: scanned a lot of rows without filling --limit; result may be partial.');
      }

      // 打在 JSON 之前：管道/重定向时 stdout 只有数据，这句走 stderr 不会污染解析。
      warnMaybeMore(rows.length, limit);

      if (args.format === 'json') {
        printJson(rows);
        await logger.success();
        return;
      }

      if (rows.length === 0) {
        console.log("No beans found. Use 'brew-guide bean add' to create one.");
        await logger.success();
        return;
      }

      printHumanRecords(rows);
      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
