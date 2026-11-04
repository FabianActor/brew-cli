import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { exitForError } from '../../lib/exit.ts';
import { printJson } from '../../lib/output.ts';
import { listEquipment } from '../../services/equipment.ts';

const argsDef = {
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List all custom equipment.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['equipment', 'list'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'equipment list');

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const items = await listEquipment(supabase, config.brewGuideUserId);

      if (items.length === 0) {
        if (args.format === 'json') {
          printJson([]);
        } else {
          console.log('No equipment found.');
        }
        await logger.success();
        return;
      }

      if (args.format === 'json') {
        printJson(items);
      } else {
        for (const eq of items) {
          const fields = [
            String(eq.id ?? '').slice(0, 8),
            eq.name,
            eq.animationType,
            eq.hasValve ? 'valve' : '',
          ].filter(Boolean);
          console.log(fields.join(' | '));
        }
        console.log(`\n${items.length} equipment`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
