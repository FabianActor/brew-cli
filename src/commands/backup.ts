import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { defineCommand } from 'citty';
import { createSupabaseClient } from '../client.ts';
import { resolveConfig } from '../config.ts';
import { createCommandLogger } from '../logger.ts';
import { assertKnownFlags } from '../lib/args.ts';
import { EXIT, exitForError } from '../lib/exit.ts';
import { printJson } from '../lib/output.ts';

/** 备份覆盖的表，顺序即输出顺序。`softDelete: false` 的表没有 deleted_at 列。 */
export const BACKUP_TABLES: Array<{ name: string; softDelete: boolean }> = [
  { name: 'coffee_beans', softDelete: true },
  { name: 'brewing_notes', softDelete: true },
  { name: 'custom_equipments', softDelete: true },
  { name: 'custom_methods', softDelete: true },
  { name: 'user_settings', softDelete: false },
];

function timestampSuffix(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

const argsDef = {
  out: { type: 'string', description: 'Output file path (default: brew-guide-backup-<timestamp>.json).' },
  'include-deleted': {
    type: 'boolean',
    default: true,
    description: 'Include soft-deleted rows (default: true).',
  },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'backup',
    description: 'Dump every table to a local JSON file.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['backup'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'backup');

    const includeDeleted = args['include-deleted'] !== false;
    const outPath = resolve(
      typeof args.out === 'string' && args.out.trim()
        ? args.out.trim()
        : `brew-guide-backup-${timestampSuffix()}.json`,
    );

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);

      const tables: Record<string, unknown[]> = {};
      const counts: Record<string, number> = {};

      for (const table of BACKUP_TABLES) {
        const columns = table.softDelete ? 'id, data, updated_at, deleted_at' : 'id, data, updated_at';
        let query = supabase
          .from(table.name)
          .select(columns)
          .eq('user_id', config.brewGuideUserId);

        if (table.softDelete && !includeDeleted) {
          query = query.is('deleted_at', null);
        }

        const { data, error } = await query;
        if (error) {
          throw new Error(`Failed to back up ${table.name}: ${error.message}`);
        }

        tables[table.name] = data ?? [];
        counts[table.name] = (data ?? []).length;
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        userId: config.brewGuideUserId,
        supabaseUrl: config.supabaseUrl,
        includeDeleted,
        counts,
        tables,
      };

      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');

      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

      if (args.format === 'json') {
        printJson({ out: outPath, counts, total });
      } else {
        console.log(`Backup written to ${outPath}`);
        for (const table of BACKUP_TABLES) {
          console.log(`  ${table.name}: ${counts[table.name]}`);
        }
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
