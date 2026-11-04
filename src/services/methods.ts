/**
 * 冲煮方案业务逻辑层。
 * 对应 agent-harness 的 core/methods.py。
 *
 * 特殊结构：custom_methods 表中一行 = 一个 equipment 的所有 methods，
 * 行的 id 就是 equipmentId，data.methods 是方案数组。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateMethodId } from '../lib/ids.ts';
import { fetchActiveRecords, fetchRecordById, upsertRecord } from './base.ts';

const TABLE = 'custom_methods';

/**
 * 查询冲煮方案列表，可按 equipment 筛选。
 */
export async function listMethods(
  supabase: SupabaseClient,
  userId: string,
  equipmentId?: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await fetchActiveRecords(supabase, TABLE, userId);
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const eqId = row.id;
    if (equipmentId && eqId !== equipmentId) continue;

    const methods = Array.isArray(row.data.methods) ? row.data.methods : [];
    for (const m of methods) {
      if (typeof m === 'object' && m !== null) {
        results.push({ ...(m as Record<string, unknown>), _equipmentId: eqId });
      }
    }
  }

  return results;
}

/**
 * 按 method ID 查询单个方案详情。
 */
export async function getMethod(
  supabase: SupabaseClient,
  methodId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await fetchActiveRecords(supabase, TABLE, userId);

  for (const row of rows) {
    const methods = Array.isArray(row.data.methods) ? row.data.methods : [];
    for (const m of methods) {
      if (typeof m === 'object' && m !== null && (m as Record<string, unknown>).id === methodId) {
        return { ...(m as Record<string, unknown>), _equipmentId: row.id };
      }
    }
  }

  return null;
}

/**
 * 添加冲煮方案到指定 equipment 下。
 */
export async function addMethod(
  supabase: SupabaseClient,
  equipmentId: string,
  name: string,
  params: { coffee?: string; water?: string; ratio?: string; grindSize?: string; temp?: string; stages?: unknown[] },
  userId: string,
): Promise<Record<string, unknown>> {
  // 与主应用 generateMethodId 同格式：method-<ms>-<7 位短随机>（customMethodStore.ts:74-76）
  const methodId = generateMethodId();
  const method: Record<string, unknown> = {
    id: methodId,
    name,
    params: {
      coffee: params.coffee ?? '',
      water: params.water ?? '',
      ratio: params.ratio ?? '',
      grindSize: params.grindSize ?? '',
      temp: params.temp ?? '',
      stages: params.stages ?? [],
    },
    timestamp: Date.now(),
  };

  const row = await fetchRecordById(supabase, TABLE, equipmentId, userId);
  let data: Record<string, unknown>;

  if (row) {
    data = row.data;
    const methods = Array.isArray(data.methods) ? data.methods : [];
    methods.push(method);
    data.methods = methods;
  } else {
    data = { equipmentId, methods: [method] };
  }

  await upsertRecord(supabase, TABLE, equipmentId, data, userId, row?.updated_at);
  return { ...method, _equipmentId: equipmentId };
}

/**
 * 更新冲煮方案字段。
 */
export async function updateMethod(
  supabase: SupabaseClient,
  methodId: string,
  updates: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await fetchActiveRecords(supabase, TABLE, userId);

  for (const row of rows) {
    const data = row.data;
    const methods = Array.isArray(data.methods) ? data.methods : [];

    for (let i = 0; i < methods.length; i++) {
      const m = methods[i] as Record<string, unknown>;
      if (m.id === methodId) {
        const mergedParams =
          updates.params && typeof updates.params === 'object'
            ? { ...(m.params as Record<string, unknown> | undefined ?? {}), ...(updates.params as Record<string, unknown>) }
            : m.params;
        const updated = { ...m, ...updates, params: mergedParams };
        methods[i] = updated;
        data.methods = methods;
        await upsertRecord(supabase, TABLE, row.id, data, userId, row.updated_at);
        return { ...updated, _equipmentId: row.id };
      }
    }
  }

  return null;
}

/**
 * 删除冲煮方案（从 methods 数组中移除）。
 */
export async function deleteMethod(
  supabase: SupabaseClient,
  methodId: string,
  userId: string,
): Promise<boolean> {
  const rows = await fetchActiveRecords(supabase, TABLE, userId);

  for (const row of rows) {
    const data = row.data;
    const methods = Array.isArray(data.methods) ? data.methods : [];
    const filtered = methods.filter(
      (m) => typeof m === 'object' && m !== null && (m as Record<string, unknown>).id !== methodId,
    );

    if (filtered.length < methods.length) {
      data.methods = filtered;
      await upsertRecord(supabase, TABLE, row.id, data, userId, row.updated_at);
      return true;
    }
  }

  return false;
}

