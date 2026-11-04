/**
 * 自定义器具业务逻辑层。
 * 对应 agent-harness 的 core/equipment.py。
 */
import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchActiveRecords,
  fetchRecordById,
  upsertRecord,
  softDeleteRecord,
} from './base.ts';

const TABLE = 'custom_equipments';

/**
 * 为自定义器具生成稳定的 ID。
 * 与 brew-guide 主应用保持一致：优先沿用用户指定的 slug（例如 "V60"、"蛋糕滤杯"），
 * 否则基于当前时间戳生成 `custom-xxxxxxx`，避免使用 UUID 造成跨表 join 困难。
 */
function deriveEquipmentId(explicit: string | undefined, name: string): string {
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) {
    return `custom-${slug}-${Date.now().toString(36)}`;
  }
  return `custom-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * 查询所有自定义器具。
 */
export async function listEquipment(
  supabase: SupabaseClient,
  userId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await fetchActiveRecords(supabase, TABLE, userId);
  return rows.map((row) => ({
    ...row.data,
    id: row.id,
    updated_at: row.updated_at,
  }));
}

/**
 * 查询单个器具详情。
 */
export async function getEquipment(
  supabase: SupabaseClient,
  eqId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const row = await fetchRecordById(supabase, TABLE, eqId, userId);
  if (!row) return null;
  return { ...row.data, id: row.id, updated_at: row.updated_at };
}

/**
 * 添加自定义器具。
 *
 * ID 是稳定 slug（例如 "V60"），所以“新增”很容易撞上已有记录。
 * 默认拒绝覆盖，避免一次 add 把原器具的 note / hasValve 悄悄换掉；
 * 确实要覆盖时显式传 `{ force: true }`（CLI 的 `--force`）。
 */
export async function addEquipment(
  supabase: SupabaseClient,
  name: string,
  animationType: string,
  hasValve: boolean,
  note: string,
  userId: string,
  id?: string,
  options?: { force?: boolean },
): Promise<Record<string, unknown>> {
  const eqId = deriveEquipmentId(id, name);

  const existing = await fetchRecordById(supabase, TABLE, eqId, userId);
  if (existing && !options?.force) {
    const existingName = typeof existing.data.name === 'string' ? existing.data.name : eqId;
    throw new Error(`器具 "${eqId}" 已存在（${existingName}）。换一个 --id，或加 --force 覆盖。`);
  }

  // `--force` 覆盖时保留旧行里没有命令开关的字段（App 画的自定义图形等），
  // 只替换显式传进来的这几项；否则一次覆盖就把别人画的东西抹掉了。
  const data: Record<string, unknown> = existing
    ? {
        ...existing.data,
        name,
        isCustom: true,
        animationType,
        hasValve,
        note,
        timestamp:
          typeof existing.data.timestamp === 'number' ? existing.data.timestamp : Date.now(),
      }
    : {
        name,
        isCustom: true,
        animationType,
        hasValve,
        note,
        // 主应用里所有 data.timestamp 都是毫秒数（customEquipmentStore.ts:112），不要写成 ISO 字符串。
        timestamp: Date.now(),
      };

  await upsertRecord(supabase, TABLE, eqId, data, userId, existing?.updated_at);
  return { ...data, id: eqId };
}

/**
 * 更新器具字段。
 */
export async function updateEquipment(
  supabase: SupabaseClient,
  eqId: string,
  updates: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const row = await fetchRecordById(supabase, TABLE, eqId, userId);
  if (!row) return null;

  const merged = { ...row.data, ...updates };
  await upsertRecord(supabase, TABLE, eqId, merged, userId, row.updated_at);
  return { ...merged, id: eqId };
}

/**
 * 软删除器具。
 */
export async function deleteEquipment(
  supabase: SupabaseClient,
  eqId: string,
  userId: string,
): Promise<boolean> {
  const row = await fetchRecordById(supabase, TABLE, eqId, userId);
  if (!row) return false;
  await softDeleteRecord(supabase, TABLE, eqId, userId, row.updated_at);
  return true;
}
