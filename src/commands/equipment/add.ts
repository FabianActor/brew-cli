import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { addEquipment } from '../../services/equipment.ts';

function exitWithError(message: string, code: number) {
  console.error(message);
  process.exit(code);
}

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a new custom equipment.',
  },
  args: {
    name: { type: 'string', required: true, description: 'Equipment name.' },
    id: {
      type: 'string',
      description: 'Optional stable ID (slug). Defaults to custom-<slug>-<ts>. Used to cross-reference custom_methods rows.',
    },
    'animation-type': {
      type: 'string',
      default: 'custom',
      description: 'Type: v60, kalita, origami, clever, custom, espresso.',
    },
    'has-valve': { type: 'boolean', default: false, description: 'Whether it has a valve (for immersion).' },
    note: { type: 'string', default: '', description: 'Note about the equipment.' },
    force: { type: 'boolean', default: false, description: 'Overwrite the existing equipment with the same ID.' },
    'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
    format: { type: 'string' },
  },
  async run({ args }) {
    const logger = createCommandLogger(['equipment', 'add'], args as Record<string, unknown>);

    const equipmentData = {
      name: args.name,
      animationType: args['animation-type'] ?? 'custom',
      hasValve: args['has-valve'] === true,
      note: typeof args.note === 'string' ? args.note : '',
    };

    if (args['dry-run']) {
      if (args.format === 'json') {
        console.log(JSON.stringify({ dryRun: true, equipment: equipmentData }));
      } else {
        console.log(`[dry-run] Would add equipment:\n${JSON.stringify(equipmentData, null, 2)}`);
      }
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const result = await addEquipment(
        supabase,
        equipmentData.name,
        equipmentData.animationType,
        equipmentData.hasValve,
        equipmentData.note,
        config.brewGuideUserId,
        typeof args.id === 'string' && args.id.trim() ? args.id.trim() : undefined,
        { force: args.force === true },
      );

      if (args.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Added equipment: ${result.name} (ID: ${String(result.id).slice(0, 8)})`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      const message = error instanceof Error ? error.message : String(error);
      exitWithError(`Error: ${message}`, 1);
    }
  },
});
