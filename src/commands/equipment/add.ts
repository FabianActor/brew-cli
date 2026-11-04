import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { assertAnimationType, ANIMATION_TYPES } from '../../lib/equipmentTypes.ts';
import { exitForError } from '../../lib/exit.ts';
import { printJson } from '../../lib/output.ts';
import { addEquipment } from '../../services/equipment.ts';

const argsDef = {
  name: { type: 'string', required: true, description: 'Equipment name.' },
  id: {
    type: 'string',
    description: 'Optional stable ID (slug). Defaults to custom-<slug>-<ts>. Used to cross-reference custom_methods rows.',
  },
  'animation-type': {
    type: 'string',
    default: 'custom',
    description: `动画类型：${ANIMATION_TYPES.join(' / ')}（写别的值 App 会退回 V60 动画，所以这里直接报错）。`,
  },
  'has-valve': { type: 'boolean', default: false, description: 'Whether it has a valve (for immersion).' },
  note: { type: 'string', default: '', description: 'Note about the equipment.' },
  force: { type: 'boolean', default: false, description: 'Overwrite the existing equipment with the same ID.' },
  'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a new custom equipment.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['equipment', 'add'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'equipment add');

    const equipmentData = {
      name: args.name,
      animationType: assertAnimationType(
        typeof args['animation-type'] === 'string' && args['animation-type']
          ? args['animation-type']
          : 'custom',
      ),
      hasValve: args['has-valve'] === true,
      note: typeof args.note === 'string' ? args.note : '',
    };

    if (args['dry-run']) {
      if (args.format === 'json') {
        // dry-run 预览也用紧凑 JSON：stdout 只放数据
        printJson({ dryRun: true, equipment: equipmentData });
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
        printJson(result);
      } else {
        console.log(`Added equipment: ${result.name} (ID: ${result.id})`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
