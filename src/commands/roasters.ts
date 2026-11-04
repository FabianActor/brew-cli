import { defineCommand } from 'citty';
import { createSupabaseClient } from '../client.ts';
import { resolveConfig } from '../config.ts';
import { createCommandLogger } from '../logger.ts';
import { assertKnownFlags } from '../lib/args.ts';
import { EXIT, exitForError, exitWithError } from '../lib/exit.ts';
import { printJson } from '../lib/output.ts';
import { MissingRoastersFunctionError, roastersFunctionGuide } from '../lib/roastersSql.ts';
import { listRoasters } from '../services/roasters.ts';

const argsDef = {
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'roasters',
    description: 'List all roasters.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['roasters'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'roasters');

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const roasters = await listRoasters(supabase);

      if (args.format === 'json') {
        printJson(roasters);
        await logger.success();
        return;
      }

      if (roasters.length === 0) {
        console.log('No roasters found. Add beans with --roaster to see them here.');
        await logger.success();
        return;
      }

      for (const roaster of roasters) {
        console.log(roaster);
      }
      await logger.success();
    } catch (error) {
      await logger.error(error);
      if (error instanceof MissingRoastersFunctionError) {
        exitWithError(roastersFunctionGuide(), EXIT.FAILURE);
      }
      exitForError(error);
    }
  },
});
