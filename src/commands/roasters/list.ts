import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { EXIT, exitForError, exitWithError } from '../../lib/exit.ts';
import { printJson } from '../../lib/output.ts';
import { MissingRoastersFunctionError, roastersFunctionGuide } from '../../lib/roastersSql.ts';
import { listRoasters } from '../../services/roasters.ts';

export const listArgsDef = {
  format: { type: 'string' },
} as const;

/**
 * `roasters` 和 `roasters list` 共用这一段。
 * `command` 只影响日志里的命令名和「不认识这个 flag」的报错文案。
 */
export async function runRoastersList(
  args: Record<string, unknown>,
  command = 'roasters list',
): Promise<void> {
  const logger = createCommandLogger(command.split(' '), args);
  assertKnownFlags(args, listArgsDef, command);

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
}

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List all roasters.',
  },
  args: listArgsDef,
  async run({ args }) {
    await runRoastersList(args as Record<string, unknown>, 'roasters list');
  },
});
