import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { EXIT, exitForError, exitWithError } from '../../lib/exit.ts';
import { printJson } from '../../lib/output.ts';
import { getEquipment } from '../../services/equipment.ts';
import { addMethod } from '../../services/methods.ts';

const argsDef = {
  'equipment-id': { type: 'string', required: true, description: 'Equipment ID to add method to.' },
  name: { type: 'string', required: true, description: 'Method name.' },
  coffee: { type: 'string', default: '', description: 'Coffee amount.' },
  water: { type: 'string', default: '', description: 'Water amount.' },
  ratio: { type: 'string', default: '', description: 'Brew ratio.' },
  'grind-size': { type: 'string', default: '', description: 'Grind size.' },
  temp: { type: 'string', default: '', description: 'Water temperature.' },
  'stages-json': { type: 'string', description: 'Stages as JSON array.' },
  'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a new brewing method to an equipment.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['method', 'add'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'method add');

    let stages: unknown[] = [];
    if (typeof args['stages-json'] === 'string' && args['stages-json']) {
      try {
        stages = JSON.parse(args['stages-json']);
      } catch {
        exitWithError('Error: --stages-json must be a valid JSON array.', EXIT.USAGE);
      }
      if (!Array.isArray(stages)) {
        exitWithError('Error: --stages-json 必须是数组，例如 \'[{"name":"闷蒸","water":30}]\'。', EXIT.USAGE);
      }
    }

    const methodData = {
      equipmentId: args['equipment-id'],
      name: args.name,
      params: {
        coffee: args.coffee ?? '',
        water: args.water ?? '',
        ratio: args.ratio ?? '',
        grindSize: args['grind-size'] ?? '',
        temp: args.temp ?? '',
        stages,
      },
    };

    if (args['dry-run']) {
      if (args.format === 'json') {
        printJson({ dryRun: true, method: methodData });
      } else {
        console.log(`[dry-run] Would add method:\n${JSON.stringify(methodData, null, 2)}`);
      }
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);

      // 器具不存在时建方法会留下孤儿记录，写入前先确认
      const equipment = await getEquipment(supabase, args['equipment-id'], config.brewGuideUserId);
      if (!equipment) {
        await logger.error(`Equipment ${args['equipment-id']} not found`);
        exitWithError(
          `Equipment ${args['equipment-id']} 不存在（或已删除）。先用 brew-guide equipment list 确认 --equipment-id。`,
          EXIT.USAGE,
        );
      }

      const result = await addMethod(
        supabase,
        args['equipment-id'],
        args.name,
        methodData.params,
        config.brewGuideUserId,
      );

      if (args.format === 'json') {
        printJson(result);
      } else {
        console.log(`Added method: ${result.name} (ID: ${String(result.id).slice(0, 8)})`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
