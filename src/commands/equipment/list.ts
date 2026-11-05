import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { exitForError } from '../../lib/exit.ts';
import { formatFields, plural, printJson } from '../../lib/output.ts';
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
          console.log(
            formatFields([
              eq.id,
              eq.name,
              eq.animationType,
              eq.hasValve ? 'valve' : undefined,
            ]),
          );
        }
        console.log(`\n${plural(items.length, 'equipment', 'equipment')}`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
