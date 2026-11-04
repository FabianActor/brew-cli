import { Type } from '@sinclair/typebox';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrewGuideConfig } from '../config.ts';
import { generateId } from '../lib/ids.ts';
import { now } from '../lib/timestamps.ts';
import { getErrorMessage, invalidParamsResult, isRecord, textResult } from '../lib/toolResults.ts';
import type { CoffeeBean } from '../types/coffeeBean.ts';

function normalizeWeight(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.replace(/\s+/g, '').replace(/(g|G|克)$/u, '');
  return normalized || value;
}

/**
 * brew_guide_upsert_bean 工具的参数 schema。
 * 定义具体字段但允许额外属性，兼顾校验和灵活性。
 */
export const upsertBeanParameters = Type.Object({
  bean: Type.Object(
    {
      id: Type.Optional(Type.String({ description: 'Bean record ID. Auto-generated if omitted.' })),
      name: Type.String({ description: 'Coffee bean name.' }),
      origin: Type.Optional(Type.String({ description: 'Country or region of origin (legacy field: put the country here).' })),
      country: Type.Optional(Type.String({ description: 'Country of origin (only when the country field is enabled).' })),
      region: Type.Optional(Type.String({ description: 'Region, e.g. "Guji Hambela".' })),
      estate: Type.Optional(Type.String({ description: 'Estate / washing station / cooperative name.' })),
      processingStation: Type.Optional(Type.String({ description: 'Processing station, when explicitly labeled.' })),
      altitude: Type.Optional(Type.String({ description: 'Altitude, e.g. "1920-2020m".' })),
      roaster: Type.Optional(Type.String({ description: 'Roaster name.' })),
      process: Type.Optional(Type.String({ description: 'Processing method (e.g. washed, natural).' })),
      variety: Type.Optional(Type.String({ description: 'Coffee variety (e.g. Gesha, Typica).' })),
      batch: Type.Optional(Type.String({ description: 'Lot / batch.' })),
      blendComponents: Type.Optional(
        Type.Array(
          Type.Object(
            {
              percentage: Type.Optional(Type.Number({ description: 'Share of the blend, 1-100.' })),
              origin: Type.Optional(Type.String()),
              country: Type.Optional(Type.String()),
              region: Type.Optional(Type.String()),
              estate: Type.Optional(Type.String()),
              processingStation: Type.Optional(Type.String()),
              altitude: Type.Optional(Type.String()),
              process: Type.Optional(Type.String()),
              variety: Type.Optional(Type.String()),
              batch: Type.Optional(Type.String()),
            },
            { additionalProperties: true },
          ),
          { description: 'Blend components. Overrides the flat origin/process/... fields.' },
        ),
      ),
      roastLevel: Type.Optional(Type.String({ description: 'Roast level (e.g. light, medium, dark).' })),
      purchaseDate: Type.Optional(Type.String({ description: 'Purchase date (ISO string).' })),
      roastDate: Type.Optional(Type.String({ description: 'Roast date (ISO string).' })),
      isInTransit: Type.Optional(Type.Boolean({ description: 'Whether the bean is still in transit.' })),
      startDay: Type.Optional(Type.Number({ description: 'Recommended resting start day as a number.' })),
      endDay: Type.Optional(Type.Number({ description: 'Recommended resting end day as a number.' })),
      notes: Type.Optional(Type.String({ description: 'Free-form notes about this bean.' })),
    },
    { additionalProperties: true },
  ),
});

/**
 * 执行咖啡豆 upsert 操作。
 */
export async function executeUpsertBean(
  supabase: SupabaseClient,
  config: BrewGuideConfig,
  params: { bean: Partial<CoffeeBean> & Record<string, unknown> } | undefined,
) {
  if (!isRecord(params) || !isRecord(params.bean)) {
    return invalidParamsResult('brew_guide_upsert_bean', '{ bean: object }');
  }

  const bean = params.bean;
  const id = (bean.id as string) || generateId('bean');
  const ts = now();

  const normalizedBean: CoffeeBean = {
    ...bean,
    id,
    timestamp: typeof bean.timestamp === 'number' ? bean.timestamp : Date.parse(ts),
  } as CoffeeBean;

  if (!Array.isArray(normalizedBean.blendComponents) || normalizedBean.blendComponents.length === 0) {
    const component: Record<string, unknown> = {};
    const flatKeys = [
      'origin',
      'country',
      'region',
      'estate',
      'processingStation',
      'altitude',
      'process',
      'variety',
      'batch',
    ] as const;
    for (const key of flatKeys) {
      const value = normalizedBean[key];
      if (typeof value === 'string' && value) component[key] = value;
    }
    if (Object.keys(component).length > 0) {
      normalizedBean.blendComponents = [component];
    }
  }

  for (const key of [
    'origin',
    'country',
    'region',
    'estate',
    'processingStation',
    'altitude',
    'process',
    'variety',
    'batch',
  ] as const) {
    delete normalizedBean[key];
  }

  normalizedBean.capacity = normalizeWeight(normalizedBean.capacity) as CoffeeBean['capacity'];
  normalizedBean.remaining = normalizeWeight(normalizedBean.remaining) as CoffeeBean['remaining'];

  if (!normalizedBean.beanType) {
    normalizedBean.beanType = 'filter';
  }
  if (!normalizedBean.roastLevel && normalizedBean.beanType === 'filter') {
    normalizedBean.roastLevel = '浅度烘焙';
  }
  if (!normalizedBean.roastLevel && normalizedBean.beanType === 'espresso') {
    normalizedBean.roastLevel = '中深烘焙';
  }
  if (!normalizedBean.beanState) {
    normalizedBean.beanState = 'roasted';
  }
  if (typeof normalizedBean.isFrozen !== 'boolean') {
    normalizedBean.isFrozen = false;
  }
  const startDayValue = normalizedBean.startDay as unknown;
  if (typeof startDayValue === 'string' && startDayValue.trim()) {
    const parsed = Number(startDayValue);
    if (Number.isFinite(parsed)) {
      normalizedBean.startDay = parsed;
    }
  }
  const endDayValue = normalizedBean.endDay as unknown;
  if (typeof endDayValue === 'string' && endDayValue.trim()) {
    const parsed = Number(endDayValue);
    if (Number.isFinite(parsed)) {
      normalizedBean.endDay = parsed;
    }
  }
  if (typeof normalizedBean.startDay !== 'number') {
    normalizedBean.startDay = 30;
  }
  if (typeof normalizedBean.endDay !== 'number') {
    normalizedBean.endDay = 60;
  }
  if (typeof normalizedBean.roastDate === 'string' && normalizedBean.roastDate.trim()) {
    normalizedBean.isInTransit = false;
  } else if (typeof normalizedBean.isInTransit !== 'boolean') {
    normalizedBean.isInTransit = true;
  }
  if (normalizedBean.remaining == null && typeof normalizedBean.capacity === 'string' && normalizedBean.capacity) {
    normalizedBean.remaining = normalizedBean.capacity;
  }

  const dataJson = JSON.stringify(normalizedBean);
  if (dataJson.length > 64_000) {
    return textResult('Bean data exceeds 64 KB limit. Reduce payload size before retrying.');
  }

  try {
    // deleted_at: null 确保 upsert 同时恢复已软删除的记录
    const { error } = await supabase
      .from('coffee_beans')
      .upsert(
        {
          id,
          user_id: config.brewGuideUserId,
          data: normalizedBean,
          updated_at: ts,
          deleted_at: null,
        },
        { onConflict: 'id,user_id' },
      );

    if (error) {
      return textResult(`Failed to upsert bean: ${error.message}`);
    }

    return textResult(`Upserted coffee bean ${id} at ${ts}.`);
  } catch (error) {
    return textResult(`Failed to upsert bean: ${getErrorMessage(error)}`);
  }
}
