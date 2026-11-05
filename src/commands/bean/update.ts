import { defineCommand } from 'citty';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags, nonEmptyString } from '../../lib/args.ts';
import {
  assertComponentsUsable,
  buildBlendComponents,
  componentFromFlags,
} from '../../lib/blendComponents.ts';
import { EXIT, exitWithError } from '../../lib/exit.ts';
import { warn } from '../../lib/output.ts';
import {
  parseBeanState,
  parseDateOnly,
  parsePrice,
  resolveTransitFlags,
  todayLocalDate,
} from '../../lib/beanInput.ts';
import { BEAN_TYPES, normalizeRoastLevel } from '../../lib/roast.ts';
import { normalizeWeight } from '../../lib/weights.ts';
import { updateBean } from '../../services/beans.ts';

const argsDef = {
id: { type: 'positional', required: true, description: 'Bean record ID.' },
  name: { type: 'string', description: 'Bean name.' },
  roaster: { type: 'string', description: 'Roaster name.' },
  'roast-level': { type: 'string', description: 'Roast level.' },
  capacity: { type: 'string', description: 'Total capacity.' },
  remaining: { type: 'string', description: 'Remaining amount.' },
  price: { type: 'string', description: '整包价格（元），只收数字，如 88 或 88.5。' },
  notes: { type: 'string', description: 'Notes.' },
  origin: { type: 'string', description: '产地（写进 blendComponents[--component-index]，编号从 1 开始）。' },
  process: { type: 'string', description: '处理法。' },
  country: { type: 'string', description: '产国。' },
  region: { type: 'string', description: '产区，如 "古吉 罕贝拉"。' },
  estate: { type: 'string', description: '庄园 / 处理厂 / 合作社。' },
  'processing-station': { type: 'string', description: '处理站。' },
  altitude: { type: 'string', description: '海拔，如 "1920-2020m"。' },
  variety: { type: 'string', description: '品种。' },
  batch: { type: 'string', description: '批次。' },
  percentage: { type: 'string', description: '成分占比 1-100。' },
  'component-index': { type: 'string', description: '改第几个成分，编号从 1 开始（默认 1）。' },
  component: {
    type: 'string',
    description:
      '整组替换成分，可重复：--component "origin=秘鲁;percentage=33" --component "origin=巴西;percentage=67"。',
  },
  'roast-date': { type: 'string', description: 'Roast date (YYYY-MM-DD).' },
  'bean-state': { type: 'string', description: 'roasted / green。转成生豆会清掉烘焙日期与赏味期，并把 --purchase-date 补成今天。' },
  'purchase-date': { type: 'string', description: '购买日期 YYYY-MM-DD（生豆）。' },
  'in-transit': { type: 'boolean', description: '标记为在途（--no-in-transit 取消）。与 --is-frozen 互斥。' },
  'is-frozen': { type: 'boolean', description: '标记为冷冻保存（--no-frozen 取消）。与 --in-transit 互斥。' },
  'start-day': { type: 'string', description: 'Optimal start day after roast.' },
  'end-day': { type: 'string', description: 'Optimal end day after roast.' },
  'bean-type': { type: 'string', description: '豆种：filter / espresso / omni。' },
  flavor: { type: 'string', description: '风味，逗号分隔，如 "花香,莓果"。' },
  'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
  format: { type: 'string' },
} as const;

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Update a coffee bean\'s fields.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['bean', 'update'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'bean update');

    const updates: Record<string, unknown> = {};
    const name = nonEmptyString(args.name, '--name', '要改名字请给具体值');
    if (name !== undefined) updates.name = name;
    const roasterName = nonEmptyString(args.roaster, '--roaster');
    if (roasterName !== undefined) updates.roaster = roasterName;
    const roastLevelRaw = nonEmptyString(args['roast-level'], '--roast-level');
    if (roastLevelRaw !== undefined) {
      // 与 bean add 同一套归一化：把「浅度」补成「浅度烘焙」；不是标准值时提醒但仍照写。
      const normalized = normalizeRoastLevel(roastLevelRaw);
      if (normalized.warning) warn(normalized.warning);
      updates.roastLevel = normalized.value;
    }
    const beanType = nonEmptyString(args['bean-type'], '--bean-type');
    if (beanType !== undefined) {
      if (!BEAN_TYPES.includes(beanType as (typeof BEAN_TYPES)[number])) {
        exitWithError(`Error: --bean-type must be one of ${BEAN_TYPES.join(', ')}.`, EXIT.USAGE);
      }
      updates.beanType = beanType;
    }
    const flavorRaw = nonEmptyString(args.flavor, '--flavor');
    if (flavorRaw !== undefined) {
      updates.flavor = flavorRaw
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    const capacity = nonEmptyString(normalizeWeight(args.capacity), '--capacity', '用 150 或 150g');
    if (capacity !== undefined) updates.capacity = capacity;
    const remaining = nonEmptyString(normalizeWeight(args.remaining), '--remaining', '用 120 或 120g');
    if (remaining !== undefined) updates.remaining = remaining;
    const price = nonEmptyString(args.price, '--price');
    if (price !== undefined) updates.price = parsePrice(price);
    // notes 允许显式清空：--notes "" 视为"清掉备注"，这是唯一合法的空值。
    if (typeof args.notes === 'string') updates.notes = args.notes;

    // 在途 / 冷冻：App 的显示状态，互斥。--no-in-transit / --no-frozen 取消。
    Object.assign(updates, resolveTransitFlags(args['in-transit'], args['is-frozen']));

    // 生豆 / 熟豆：roasted ↔ green 是两套日期语义（BasicInfoSection.tsx:92-106）。
    const beanStateArg = nonEmptyString(args['bean-state'], '--bean-state');
    const purchaseDateArg = nonEmptyString(args['purchase-date'], '--purchase-date');
    if (beanStateArg !== undefined) {
      const beanState = parseBeanState(beanStateArg);
      updates.beanState = beanState;
      if (beanState === 'green') {
        if (typeof args['roast-date'] === 'string' && args['roast-date']) {
          exitWithError(
            'Error: 生豆没有烘焙日期（--bean-state green 与 --roast-date 冲突）。',
            EXIT.USAGE,
          );
        }
        // 生豆只看购买日期；赏味期两个值清零（App 把非正数当未设置）。
        updates.purchaseDate = purchaseDateArg
          ? parseDateOnly(purchaseDateArg, '--purchase-date')
          : todayLocalDate();
        updates.roastDate = '';
        updates.startDay = 0;
        updates.endDay = 0;
      } else if (!(typeof args['roast-date'] === 'string' && args['roast-date'])) {
        warn('Warning: 转成熟豆但没给 --roast-date，App 里这颗豆的赏味期会显示「未设置烘焙日期」。');
      }
    } else if (purchaseDateArg !== undefined) {
      updates.purchaseDate = parseDateOnly(purchaseDateArg, '--purchase-date');
    }
    const componentSpecs = Array.isArray(args.component)
      ? args.component
      : typeof args.component === 'string' && args.component
        ? [args.component]
        : [];
    const componentFlags = componentFromFlags(args as Record<string, unknown>);

    if (componentSpecs.length > 0) {
      const components = buildBlendComponents(componentSpecs, {});
      assertComponentsUsable(components);
      updates.blendComponents = components;
    } else if (Object.keys(componentFlags).length > 0) {
      Object.assign(updates, componentFlags);
      const rawIndex = typeof args['component-index'] === 'string' ? Number(args['component-index']) : 1;
      if (!Number.isInteger(rawIndex) || rawIndex < 1) {
        exitWithError('Error: --component-index 必须是从 1 开始的整数。', EXIT.USAGE);
      }
      updates.componentIndex = rawIndex - 1;
    } else if (typeof args['component-index'] === 'string') {
      exitWithError('Error: --component-index 要配合成分字段（--origin / --region / --altitude …）使用。', EXIT.USAGE);
    }
    if (typeof args['roast-date'] === 'string' && args['roast-date']) {
      updates.roastDate = parseDateOnly(args['roast-date'], '--roast-date');
      // 给了烘焙日期通常意味着豆子已经到手；但如果用户显式说了「还在途」，就不覆盖他的判断。
      if (typeof args['in-transit'] !== 'boolean' && typeof args['is-frozen'] !== 'boolean') {
        updates.isInTransit = false;
      }
    }
    if (typeof args['start-day'] === 'string' && args['start-day']) {
      const n = Number(args['start-day']);
      if (!Number.isFinite(n) || n < 0) {
        exitWithError('Error: --start-day must be a non-negative number.', EXIT.USAGE);
      }
      updates.startDay = n;
    }
    if (typeof args['end-day'] === 'string' && args['end-day']) {
      const n = Number(args['end-day']);
      if (!Number.isFinite(n) || n < 0) {
        exitWithError('Error: --end-day must be a non-negative number.', EXIT.USAGE);
      }
      updates.endDay = n;
    }

    if (Object.keys(updates).length === 0) {
      exitWithError('No fields to update. Use --name, --roaster, etc.', EXIT.USAGE);
    }

    if (args['dry-run']) {
      if (args.format === 'json') {
        console.log(JSON.stringify({ dryRun: true, action: 'update', id: args.id, updates }));
      } else {
        console.log(`[dry-run] Would update bean ${args.id}:\n${JSON.stringify(updates, null, 2)}`);
      }
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);
      const result = await updateBean(supabase, args.id, updates, config.brewGuideUserId);

      if (!result) {
        await logger.error(`Bean ${args.id} not found`);
        exitWithError(`Bean ${args.id} not found.`, EXIT.FAILURE);
      }

      if (args.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Updated bean: ${result.name ?? args.id}`);
      }

      await logger.success();
    } catch (error) {
      await logger.error(error);
      const message = error instanceof Error ? error.message : String(error);
      exitWithError(`Error: ${message}`, EXIT.FAILURE);
    }
  },
});

