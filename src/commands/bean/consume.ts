import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { EXIT, exitForError, exitWithError } from '../../lib/exit.ts';
import { printJson, warn } from '../../lib/output.ts';
import { consumeBean } from '../../services/beans.ts';
import { upsertNoteRecord } from '../../tools/upsertNote.ts';

const argsDef = {
  id: { type: 'positional', required: true, description: 'Bean record ID.' },
  amount: { type: 'string', required: true, description: 'Grams to deduct (e.g., 15).' },
  'with-note': { type: 'boolean', description: 'Also create a quick-decrement brewing note.' },
  source: { type: 'string', description: 'Source tag for the note (default: quick-decrement).' },
  'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'consume',
    description: 'Deduct coffee from a bean\'s remaining capacity.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['bean', 'consume'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'bean consume');

    const amount = Number.parseFloat(String(args.amount));
    if (Number.isNaN(amount) || amount <= 0) {
      await logger.error('Error: --amount must be a positive number.');
      exitWithError('Error: --amount must be a positive number.', EXIT.USAGE);
    }

    const source = typeof args.source === 'string' && args.source ? args.source : 'quick-decrement';
    const withNote = args['with-note'] === true;

    if (args['dry-run']) {
      const preview: Record<string, unknown> = { dryRun: true, action: 'consume', id: args.id, amount };
      if (withNote) preview.note = { beanId: args.id, source, coffee: `${amount}g` };
      if (args.format === 'json') {
        printJson(preview);
      } else {
        console.log(`[dry-run] Would consume ${amount}g from bean ${args.id.slice(0, 8)}${withNote ? ` and write ${source} note` : ''}`);
      }
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const result = await consumeBean(supabase, args.id, amount, config.brewGuideUserId);

      if (!result) {
        await logger.error(`Bean ${args.id} not found`);
        exitWithError(`Bean ${args.id} not found.`, EXIT.FAILURE);
      }

      const { bean, previousRemaining, consumed, overdrawn } = result;

      if (overdrawn) {
        await logger.error(`Overdraw: requested ${amount}g, only ${previousRemaining}g left`);
        warn(
          `Warning: 库存只有 ${previousRemaining}g，本次按 ${consumed}g 扣减，余量归零（请求 ${amount}g）。`,
        );
      }

      if (withNote) {
        // 记实际扣减量：请求超量时不能把不存在的粉写进冲煮记录
        await upsertNoteRecord(supabase, config, {
          beanId: args.id,
          source,
          rating: 0,
          params: { coffee: `${consumed}g` },
        });
      }

      if (args.format === 'json') {
        printJson({
          id: args.id,
          name: bean.name,
          previousRemaining,
          consumed,
          remaining: bean.remaining,
          overdrawn,
          noteRecorded: withNote,
        });
      } else {
        console.log(`Consumed ${consumed}g from ${bean.name ?? args.id} — remaining: ${bean.remaining}${withNote ? ` (${source} note recorded)` : ''}`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
