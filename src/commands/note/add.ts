import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { fetchRecordById } from '../../services/base.ts';
import { upsertNoteRecord } from '../../tools/upsertNote.ts';

function buildNoteData(args: Record<string, string | boolean | undefined>) {
  const noteData: Record<string, unknown> = {
    beanId: args['bean-id'],
    method: args.method,
  };

  // 真实字段（优先使用）
  if (typeof args.equipment === 'string' && args.equipment) {
    noteData.equipment = args.equipment;
  }
  if (typeof args.rating === 'string' && args.rating) {
    const n = Number(args.rating);
    if (Number.isFinite(n)) noteData.rating = n;
  }
  if (typeof args.source === 'string' && args.source) {
    noteData.source = args.source;
  }
  if (typeof args.notes === 'string' && args.notes) {
    noteData.notes = args.notes;
  }
  if (typeof args['total-time'] === 'string' && args['total-time']) {
    const n = Number(args['total-time']);
    if (Number.isFinite(n)) noteData.totalTime = n;
  }
  const taste: Record<string, number> = {};
  for (const key of ['body', 'acidity', 'sweetness', 'bitterness'] as const) {
    const raw = args[`taste-${key}`];
    if (typeof raw === 'string' && raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n <= 5) taste[key] = n;
    }
  }
  if (Object.keys(taste).length > 0) noteData.taste = taste;

  // 老字段（由 normalizeNote 转换到真实形状）
  if (typeof args['grind-size'] === 'string' && args['grind-size']) {
    noteData.grindSize = args['grind-size'];
  }
  if (typeof args['water-temp'] === 'string' && args['water-temp']) {
    noteData.waterTemp = Number(args['water-temp']);
  }
  if (typeof args.ratio === 'string' && args.ratio) {
    noteData.ratio = args.ratio;
  }
  if (typeof args['brew-time'] === 'string' && args['brew-time']) {
    noteData.brewTime = args['brew-time'];
  }
  if (typeof args.flavor === 'string' && args.flavor) {
    noteData.flavor = args.flavor;
  }
  if (typeof args.score === 'string' && args.score) {
    noteData.score = Number(args.score);
  }
  if (typeof args.memo === 'string' && args.memo) {
    noteData.memo = args.memo;
  }
  if (typeof args['brewed-at'] === 'string' && args['brewed-at']) {
    noteData.brewedAt = args['brewed-at'];
  }

  return noteData;
}

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Create a brewing note record.',
  },
  args: {
    'bean-id': { type: 'string', required: true },
    method: { type: 'string', required: true },
    equipment: { type: 'string', description: 'Equipment row id (e.g. V60, Espresso).' },
    rating: { type: 'string', description: 'Rating 0-5 (authoritative).' },
    source: { type: 'string', description: 'Source tag (e.g. quick-decrement, capacity-adjustment).' },
    notes: { type: 'string', description: 'Free-form notes (authoritative; prefer over --memo).' },
    'total-time': { type: 'string', description: 'Total brew time in seconds (authoritative; prefer over --brew-time).' },
    'taste-body': { type: 'string', description: 'Taste body 0-5.' },
    'taste-acidity': { type: 'string', description: 'Taste acidity 0-5.' },
    'taste-sweetness': { type: 'string', description: 'Taste sweetness 0-5.' },
    'taste-bitterness': { type: 'string', description: 'Taste bitterness 0-5.' },
    // legacy flat args — auto-normalized to real shape:
    'grind-size': { type: 'string', description: '[legacy] → params.grindSize.' },
    'water-temp': { type: 'string', description: '[legacy] → params.temp (°C).' },
    ratio: { type: 'string', description: '[legacy] → params.ratio.' },
    'brew-time': { type: 'string', description: '[legacy] mm:ss or seconds → totalTime.' },
    flavor: { type: 'string', description: '[legacy] merged into notes.' },
    score: { type: 'string', description: '[legacy] 0-100 → rating 0-5 (/20).' },
    memo: { type: 'string', description: '[legacy] → notes.' },
    'brewed-at': { type: 'string', description: '[legacy] ISO → timestamp.' },
    'dry-run': { type: 'boolean' },
    format: { type: 'string' },
  },
  async run({ args }) {
    const logger = createCommandLogger(['note', 'add'], args as Record<string, unknown>);
    const noteData = buildNoteData(args as Record<string, string | boolean | undefined>);
    const dryRun = args['dry-run'] === true;
    const jsonFormat = args.format === 'json';

    if (dryRun) {
      if (jsonFormat) {
        console.log(JSON.stringify({ dryRun: true, note: noteData }));
        await logger.success();
        return;
      }

      console.log(`[dry-run] Would create note:\n${JSON.stringify(noteData, null, 2)}`);
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);

      // beanId 是软引用：写之前确认豆子真的存在，否则备注会挂在一颗不存在的豆子上。
      const beanId = typeof noteData.beanId === 'string' ? noteData.beanId : '';
      const bean = beanId ? await fetchRecordById(supabase, 'coffee_beans', beanId, config.brewGuideUserId) : null;
      if (!bean) {
        exitWithError(`Error: bean ${beanId} 不存在（或已删除）。先用 brew-guide bean list 确认 --bean-id。`, EXIT.USAGE);
      }

      const { id, timestamp } = await upsertNoteRecord(supabase, config, noteData);

      if (jsonFormat) {
        console.log(JSON.stringify({ id, status: 'created', timestamp }));
        await logger.success();
        return;
      }

      console.log(`Created note ${id}`);
      await logger.success();
    } catch (error) {
      await logger.error(error);
      const message = error instanceof Error ? error.message : String(error);
      if (/Missing|Config error/i.test(message)) {
        exitWithError(`Error: Config ${message}`, EXIT.CONFIG);
      }
      if (/^Failed to (upsert|list|fetch|get)/i.test(message)) {
        exitWithError(`Error: Network ${message}`, EXIT.NETWORK);
      }
      exitWithError(`Error: ${message}`, EXIT.FAILURE);
    }
  },
});

