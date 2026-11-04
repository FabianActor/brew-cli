import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { builtinEquipmentHint, findBuiltinEquipment } from '../../lib/equipmentTypes.ts';
import { parseRating, parseTemperature } from '../../lib/noteInput.ts';
import { fetchRecordById } from '../../services/base.ts';
import { getEquipment } from '../../services/equipment.ts';
import { upsertNoteRecord } from '../../tools/upsertNote.ts';

function buildNoteData(args: Record<string, string | boolean | undefined>) {
  const noteData: Record<string, unknown> = {
    beanId: args['bean-id'],
    method: args.method,
  };

  // 真实字段（优先使用）
  if (typeof args.equipment === 'string' && args.equipment) {
    noteData.equipment = args.equipment;
    // 内置器具（V60 / 聪明杯 …）不在 custom_equipments 表里，这里直接补上 id，
    // 自定义器具要等写完库前查到记录再补（见 run()）。
    const builtin = findBuiltinEquipment(args.equipment);
    if (builtin) noteData.equipmentId = builtin.id;
  }
  if (typeof args.rating === 'string' && args.rating) {
    // 0-5 校验：以前只查 isFinite，--rating 9 会直接写进库，App 里显示 9 / 5。
    noteData.rating = parseRating(args.rating);
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
  const params: Record<string, string> = {};
  if (typeof args.coffee === 'string' && args.coffee) {
    params.coffee = args.coffee;
  }
  if (typeof args.water === 'string' && args.water) {
    params.water = args.water;
  }
  // App 的 MethodParams.temp 是带单位的字符串（"92°C"）。以前把 --water-temp 直接
  // Number() 再交给 normalizeNote 拼回去，"92°C" 会变成 "NaN°C"。
  if (typeof args['water-temp'] === 'string' && args['water-temp']) {
    params.temp = parseTemperature(args['water-temp']);
  }
  if (Object.keys(params).length > 0) noteData.params = params;
  if (typeof args['grind-size'] === 'string' && args['grind-size']) {
    noteData.grindSize = args['grind-size'];
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

const argsDef = {
'bean-id': { type: 'string', required: true },
method: { type: 'string', required: true },
equipment: { type: 'string', description: '器具：内置 id（V60 / CleverDripper / Kalita / Origami / Orea / Sinloy / Espresso）或自定义器具 id，写错会报错。' },
coffee: { type: 'string', description: '粉量，如 15g（→ params.coffee）。' },
water: { type: 'string', description: '水量，如 225g（→ params.water）。' },
  rating: { type: 'string', description: '评分，0-5（超出范围直接报错）。' },
  source: { type: 'string', description: 'Source tag (e.g. quick-decrement, capacity-adjustment).' },
  notes: { type: 'string', description: 'Free-form notes (authoritative; prefer over --memo).' },
  'total-time': { type: 'string', description: 'Total brew time in seconds (authoritative; prefer over --brew-time).' },
  'taste-body': { type: 'string', description: 'Taste body 0-5.' },
  'taste-acidity': { type: 'string', description: 'Taste acidity 0-5.' },
  'taste-sweetness': { type: 'string', description: 'Taste sweetness 0-5.' },
  'taste-bitterness': { type: 'string', description: 'Taste bitterness 0-5.' },
  // legacy flat args — auto-normalized to real shape:
  'grind-size': { type: 'string', description: '[legacy] → params.grindSize.' },
  'water-temp': { type: 'string', description: '水温，接受 92 或 92°C（→ params.temp，统一写成 "92°C"）。' },
  ratio: { type: 'string', description: '[legacy] → params.ratio.' },
  'brew-time': { type: 'string', description: '[legacy] mm:ss or seconds → totalTime.' },
  flavor: { type: 'string', description: '[legacy] merged into notes.' },
  score: { type: 'string', description: '[legacy] 0-100 → rating 0-5 (/20).' },
  memo: { type: 'string', description: '[legacy] → notes.' },
  'brewed-at': { type: 'string', description: '[legacy] ISO → timestamp.' },
  'dry-run': { type: 'boolean' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Create a brewing note record.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['note', 'add'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'note add');
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

      // App 的冲煮记录里存了一份豆子快照（page.tsx:211-216）：之后豆子改名或改烘焙度，
      // 旧记录仍然显示当时的样子。以前 CLI 不写这段，App 里只能靠 beanId 反查。
      const beanFields = (bean.data ?? {}) as Record<string, unknown>;
      noteData.coffeeBeanInfo = {
        name: typeof beanFields.name === 'string' ? beanFields.name : '',
        roastLevel:
          typeof beanFields.roastLevel === 'string' && beanFields.roastLevel
            ? beanFields.roastLevel
            : '中度烘焙',
        roastDate: typeof beanFields.roastDate === 'string' ? beanFields.roastDate : '',
        ...(typeof beanFields.roaster === 'string' && beanFields.roaster
          ? { roaster: beanFields.roaster }
          : {}),
      };

      // equipment 同样是软引用：内置器具在 buildNoteData 里已经认过并写好 equipmentId，
      // 这里只处理自定义器具 —— 查不到就报错，免得记录指不上任何器具。
      const equipmentInput =
        typeof noteData.equipment === 'string' && !noteData.equipmentId
          ? noteData.equipment.trim()
          : '';
      if (equipmentInput) {
        const custom = await getEquipment(supabase, equipmentInput, config.brewGuideUserId);
        if (!custom) {
          exitWithError(
            `Error: equipment ${equipmentInput} 不存在（或已删除）。${builtinEquipmentHint()}；自定义器具先用 brew-guide equipment list 确认 ID。`,
            EXIT.USAGE,
          );
        }
        noteData.equipmentId = equipmentInput;
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

