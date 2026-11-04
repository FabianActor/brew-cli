import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags, nonEmptyString } from '../../lib/args.ts';
import { assertAnimationType, ANIMATION_TYPES } from '../../lib/equipmentTypes.ts';
import { EXIT, exitForError, exitWithError } from '../../lib/exit.ts';
import { printJson } from '../../lib/output.ts';
import { updateEquipment } from '../../services/equipment.ts';

const argsDef = {
  id: { type: 'positional', required: true, description: 'Equipment ID.' },
  name: { type: 'string', description: 'Equipment name.' },
  note: { type: 'string', description: 'Note about the equipment ("" clears it).' },
  'animation-type': { type: 'string', description: `动画类型：${ANIMATION_TYPES.join(' / ')}。` },
  'has-valve': { type: 'string', description: 'Has valve: true or false.' },
  'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Update equipment fields.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['equipment', 'update'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'equipment update');

    const updates: Record<string, unknown> = {};
    const name = nonEmptyString(args.name, '--name', '要改名字请给具体值');
    if (name !== undefined) updates.name = name;
    // note 是唯一允许清空（""）的字段
    if (typeof args.note === 'string') updates.note = args.note;
    if (typeof args['animation-type'] === 'string' && args['animation-type']) {
      updates.animationType = assertAnimationType(args['animation-type']);
    }
    if (typeof args['has-valve'] === 'string' && args['has-valve']) {
      const v = args['has-valve'].toLowerCase();
      if (v !== 'true' && v !== 'false') {
        exitWithError('Error: --has-valve must be "true" or "false".', EXIT.USAGE);
      }
      updates.hasValve = v === 'true';
    }

    if (Object.keys(updates).length === 0) {
      exitWithError('No fields to update. Use --name, --note, --animation-type, --has-valve.', EXIT.USAGE);
    }

    if (args['dry-run']) {
      if (args.format === 'json') {
        printJson({ dryRun: true, action: 'update', id: args.id, updates });
      } else {
        console.log(`[dry-run] Would update equipment ${args.id}:\n${JSON.stringify(updates, null, 2)}`);
      }
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const result = await updateEquipment(supabase, args.id, updates, config.brewGuideUserId);

      if (!result) {
        await logger.error(`Equipment ${args.id} not found`);
        exitWithError(`Equipment ${args.id} not found.`, EXIT.FAILURE);
      }

      if (args.format === 'json') {
        printJson(result);
      } else {
        console.log(`Updated equipment: ${result.name ?? args.id}`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
