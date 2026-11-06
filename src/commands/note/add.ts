import { defineCommand } from 'citty';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig, type BrewGuideConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { builtinEquipmentHint, findBuiltinEquipment } from '../../lib/equipmentTypes.ts';
import { parseRating, parseTemperature } from '../../lib/noteInput.ts';
import { printJson, warn } from '../../lib/output.ts';
import { readImageAsDataUrl } from '../../lib/imageFile.ts';
import { fetchRecordById } from '../../services/base.ts';
import { getEquipment } from '../../services/equipment.ts';
import { upsertNoteRecord } from '../../tools/upsertNote.ts';

function buildNoteData(args: Record<string, string | boolean | undefined>) {
  // 全字段可选：App 的冲煮记录允许没有豆子、没有手法（记录页的「方法」步骤自己就是
  // 可跳过的一步，`BrewingNoteFormModal.tsx:820` 的 onSkipMethodSelect 会把 method 设成 ''）。
  // 只有明确给了才写字段，不塞 undefined。
  const noteData: Record<string, unknown> = {};
  if (typeof args['bean-id'] === 'string' && args['bean-id']) {
    noteData.beanId = args['bean-id'];
  }
  if (typeof args.method === 'string' && args.method) {
    noteData.method = args.method;
  }

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
  // 照片和豆子一样直接进 JSONB（App 的冲煮记录也是这么存的）。
  if (typeof args.image === 'string' && args.image) {
    try {
      noteData.image = readImageAsDataUrl(args.image, '--image');
    } catch (error) {
      exitWithError(`Error: ${error instanceof Error ? error.message : String(error)}`, EXIT.USAGE);
    }
  }
  if (typeof args['total-time'] === 'string' && args['total-time']) {
    const n = Number(args['total-time']);
    // 以前不是数字就静默丢掉；用户给了值却没用上，属于「说了没人听」。
    if (!Number.isFinite(n) || n < 0) {
      exitWithError(`Error: --total-time 只接受秒数（如 150），收到 "${args['total-time']}"。`, EXIT.USAGE);
    }
    noteData.totalTime = n;
  }
  const taste: Record<string, number> = {};
  for (const key of ['body', 'acidity', 'sweetness', 'bitterness'] as const) {
    const raw = args[`taste-${key}`];
    if (typeof raw === 'string' && raw) {
      const n = Number(raw);
      // 同 --rating：越界要报错，不能静默丢掉这一维。
      if (!Number.isFinite(n) || n < 0 || n > 5) {
        exitWithError(`Error: --taste-${key} 必须在 0 到 5 之间，收到 "${raw}"。`, EXIT.USAGE);
      }
      taste[key] = n;
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
'bean-id': { type: 'string', description: '咖啡豆 id（可选）。给了会校验存在性，并把豆子快照写进记录。' },
method: { type: 'string', description: '手法名称（可选，App 里这一步可跳过）。' },
equipment: { type: 'string', description: '器具：内置 id（V60 / CleverDripper / Kalita / Origami / Orea / Sinloy / Espresso）或自定义器具 id，写错会报错。' },
coffee: { type: 'string', description: '粉量，如 15g（→ params.coffee）。' },
water: { type: 'string', description: '水量，如 225g（→ params.water）。' },
  rating: { type: 'string', description: '评分，0-5（超出范围直接报错）。' },
  source: { type: 'string', description: 'Source tag (e.g. quick-decrement, capacity-adjustment).' },
  notes: { type: 'string', description: 'Free-form notes (authoritative; prefer over --memo).' },
  image: { type: 'string', description: '照片（本地文件），存成 data URL；支持 .jpg / .jpeg / .png / .webp / .gif，上限 1.5 MB。' },
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

/**
 * 校验记录里的两个软引用，并把豆子快照补进 payload。
 *
 * - `beanId`：给了就必须真的存在（否则备注挂在一款不存在的豆子上）；不给也合法 ——
 *   App 里不选豆子同样能存记录。
 * - `equipment`：内置器具（V60 / 聪明杯 …）在 buildNoteData 里已经认过并写好 id，
 *   这里只处理自定义器具，查不到就报错，免得记录指不上任何器具。
 *
 * dry-run 也走这一遍（有配置时），免得「预览成功、真跑失败」。
 */
async function resolveReferences(
  supabase: SupabaseClient,
  config: BrewGuideConfig,
  noteData: Record<string, unknown>,
): Promise<void> {
  const beanId = typeof noteData.beanId === 'string' ? noteData.beanId : '';
  const bean = beanId ? await fetchRecordById(supabase, 'coffee_beans', beanId, config.brewGuideUserId) : null;
  if (beanId && !bean) {
    throw new Error(`bean ${beanId} 不存在（或已删除）。先用 brew-guide bean list 确认 --bean-id。`);
  }
  if (bean) {
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
  }

  const equipmentInput =
    typeof noteData.equipment === 'string' && !noteData.equipmentId
      ? noteData.equipment.trim()
      : '';
  if (equipmentInput) {
    const custom = await getEquipment(supabase, equipmentInput, config.brewGuideUserId);
    if (!custom) {
      throw new Error(
        `equipment ${equipmentInput} 不存在（或已删除）。${builtinEquipmentHint()}；自定义器具先用 brew-guide equipment list 确认 ID。`,
      );
    }
    noteData.equipmentId = equipmentInput;
  }
}

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
      // dry-run 以前完全不碰库，于是「预览成功、真跑失败」：豆子/器具不存在要到真写才报错。
      // 现在有配置就顺手校验一遍；没有配置（或读不到）就明说没校验，不假装验过了。
      try {
        const config = await resolveConfig();
        const supabase = createSupabaseClient(config);
        await resolveReferences(supabase, config, noteData);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warn(`提示：dry-run 没能校验豆子 / 器具是否存在（${message}）。真跑时才会报。`);
      }

      if (jsonFormat) {
        printJson({ dryRun: true, note: noteData });
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
      await resolveReferences(supabase, config, noteData);

      const { id, timestamp } = await upsertNoteRecord(supabase, config, noteData);

      if (jsonFormat) {
        printJson({ id, status: 'created', timestamp });
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
      if (/不存在（或已删除）/.test(message)) {
        exitWithError(`Error: ${message}`, EXIT.USAGE);
      }
      exitWithError(`Error: ${message}`, EXIT.FAILURE);
    }
  },
});

