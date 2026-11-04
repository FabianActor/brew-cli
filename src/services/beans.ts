/**
 * 咖啡豆业务逻辑层。
 * 对应 agent-harness 的 core/beans.py。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseGrams } from '../lib/weights.ts';
import {
  fetchActiveRecords,
  fetchRecordById,
  upsertRecord,
  softDeleteRecord,
} from './base.ts';

const TABLE = 'coffee_beans';

export interface BeanFilters {
  roastLevel?: string;
  beanType?: string;
  hasRemaining?: boolean;
}

/**
 * 查询咖啡豆列表，支持筛选。
 */
export async function listBeans(
  supabase: SupabaseClient,
  userId: string,
  filters?: BeanFilters,
): Promise<Array<Record<string, unknown>>> {
  const rows = await fetchActiveRecords(supabase, TABLE, userId);
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const bean: Record<string, unknown> = { ...row.data, id: row.id, updated_at: row.updated_at };

    if (filters?.roastLevel && bean.roastLevel !== filters.roastLevel) continue;
    if (filters?.beanType && bean.beanType !== filters.beanType) continue;

    if (filters?.hasRemaining === true) {
      if (parseGrams(bean.remaining) <= 0) continue;
    }
    if (filters?.hasRemaining === false) {
      if (parseGrams(bean.remaining) > 0) continue;
    }

    results.push(bean);
  }

  return results;
}

/**
 * 查询单个咖啡豆详情。
 */
export async function getBean(
  supabase: SupabaseClient,
  beanId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const row = await fetchRecordById(supabase, TABLE, beanId, userId);
  if (!row) return null;
  return { ...row.data, id: row.id, updated_at: row.updated_at };
}

/** 会被合并进 blendComponents 的字段（不做深度合并，直接覆盖同名键）。 */
const BLEND_COMPONENT_KEYS = [
  'origin',
  'country',
  'region',
  'estate',
  'processingStation',
  'altitude',
  'process',
  'variety',
  'batch',
  'percentage',
] as const;

/**
 * 更新咖啡豆的部分字段（读取→合并→写回）。
 * 成分字段（origin/region/altitude…）写进 `updates.componentIndex` 指定的成分，默认第一个；
 * 传 `updates.blendComponents` 则整组替换（一次性改多成分）。
 */
export async function updateBean(
  supabase: SupabaseClient,
  beanId: string,
  updates: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const row = await fetchRecordById(supabase, TABLE, beanId, userId);
  if (!row) return null;

  const blendPatch: Record<string, unknown> = {};
  for (const key of BLEND_COMPONENT_KEYS) {
    if (updates[key] !== undefined) {
      blendPatch[key] = updates[key];
      delete updates[key];
    }
  }

  const rawIndex = updates.componentIndex;
  delete updates.componentIndex;
  const componentIndex =
    typeof rawIndex === 'number' && Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0;

  const replacement = updates.blendComponents;
  delete updates.blendComponents;

  const merged: Record<string, unknown> = { ...row.data, ...updates, id: beanId };
  const existing = Array.isArray(row.data.blendComponents) ? (row.data.blendComponents as unknown[]) : [];

  if (Array.isArray(replacement)) {
    merged.blendComponents = replacement;
  } else if (Object.keys(blendPatch).length > 0) {
    if (componentIndex >= existing.length) {
      throw new Error(
        `成分 #${componentIndex + 1} 不存在：这颗豆子只有 ${existing.length} 个成分（编号从 1 开始）。`,
      );
    }
    merged.blendComponents = existing.map((item, index) => {
      if (index !== componentIndex) return item;
      const head = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return { ...head, ...blendPatch };
    });
  }

  await upsertRecord(supabase, TABLE, beanId, merged, userId);
  return { ...merged, id: beanId };
}

/**
 * 软删除咖啡豆。
 */
export async function deleteBean(
  supabase: SupabaseClient,
  beanId: string,
  userId: string,
): Promise<boolean> {
  const row = await fetchRecordById(supabase, TABLE, beanId, userId);
  if (!row) return false;
  await softDeleteRecord(supabase, TABLE, beanId, userId);
  return true;
}

/**
 * 扣减咖啡豆余量。
 */
export async function consumeBean(
  supabase: SupabaseClient,
  beanId: string,
  amountGrams: number,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const row = await fetchRecordById(supabase, TABLE, beanId, userId);
  if (!row) return null;

  const bean: Record<string, unknown> = { ...row.data, id: beanId };
  const remaining = parseGrams(bean.remaining);
  const newRemaining = Math.max(0, remaining - amountGrams);
  bean.remaining = `${newRemaining}`;

  await upsertRecord(supabase, TABLE, beanId, bean, userId);
  return { ...bean, id: beanId };
}
