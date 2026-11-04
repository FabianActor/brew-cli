import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { exitForError } from '../../lib/exit.ts';
import { printJson } from '../../lib/output.ts';
import { listMethods } from '../../services/methods.ts';

const argsDef = {
  'equipment-id': { type: 'string', description: 'Filter by equipment ID.' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List brewing methods.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['method', 'list'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'method list');

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const equipmentId = typeof args['equipment-id'] === 'string' ? args['equipment-id'] : undefined;
      const items = await listMethods(supabase, config.brewGuideUserId, equipmentId);

      if (args.format === 'json') {
        printJson(items);
        await logger.success();
        return;
      }

      if (items.length === 0) {
        console.log('No methods found.');
        await logger.success();
        return;
      }

      for (const m of items) {
        const params = (m.params ?? {}) as Record<string, unknown>;
        const stages = Array.isArray(params.stages) ? params.stages : [];
        const fields = [
          String(m.id ?? '').slice(0, 8),
          m.name,
          params.coffee || '-',
          params.water || '-',
          params.ratio || '-',
          `${stages.length} stages`,
        ].filter(Boolean);
        console.log(fields.join(' | '));
      }
      console.log(`\n${items.length} methods`);

      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
