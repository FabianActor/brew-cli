/**
 * 通用 Supabase 数据访问层。
 * 参照 agent-harness 的 client.py，封装 CRUD 基础操作。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { now } from '../lib/timestamps.ts';

export interface SupabaseRow {
  id: string;
  data: Record<string, unknown>;
  updated_at: string;
  deleted_at?: string | null;
}

/** 每次向 PostgREST 请求的行数（默认上限通常是 1000 行，这里显式分页兜住）。 */
const FETCH_PAGE_SIZE = 500;

/**
 * 查询未删除的活跃记录，按 updated_at 降序。
 *
 * 分页拉全量：PostgREST 对单次查询有行数上限（常见 1000），
 * 不分页时超出上限的行会静默消失，改方法/删方法会变成「找不到」。
 */
export async function fetchActiveRecords(
  supabase: SupabaseClient,
  table: string,
  userId: string,
): Promise<SupabaseRow[]> {
  const rows: SupabaseRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('id, data, updated_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch records from ${table}: ${error.message}`);
    }

    const page = (data ?? []) as SupabaseRow[];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return rows;
}

/**
 * 按 ID 精确查询单条记录（忽略已软删除的）。
 */
export async function fetchRecordById(
  supabase: SupabaseClient,
  table: string,
  recordId: string,
  userId: string,
): Promise<SupabaseRow | null> {
  const { data, error } = await supabase
    .from(table)
    .select('id, data, updated_at')
    .eq('user_id', userId)
    .eq('id', recordId)
    .is('deleted_at', null)
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch record ${recordId}: ${error.message}`);
  }

  const rows = (data ?? []) as SupabaseRow[];
  return rows.length === 0 ? null : rows[0];
}

/**
 * 读到的那一行在写回之前又被改过（App 或另一条命令），本次写入被放弃。
 *
 * 主应用上传时是拿 `updated_at` 当版本号做 compare-and-swap 的
 * （brew-guide/src/lib/supabase/syncOperations.ts:867-878），CLI 跟同一套约定。
 */
export class StaleRecordError extends Error {
  constructor(table: string, recordId: string) {
    super(
      `记录 ${recordId}（${table}）在你读取之后被改过或删掉了（可能来自 App 或另一次命令）。` +
        '为避免覆盖别人的改动，本次没有写入；重新执行即可基于最新数据重试。',
    );
    this.name = 'StaleRecordError';
  }
}

/**
 * 插入或更新一条记录。
 *
 * 传了 `expectedUpdatedAt` 就走 compare-and-swap：只有当库里的 `updated_at`
 * 仍等于调用方读到的那一版时才写，否则抛 `StaleRecordError`。
 */
export async function upsertRecord(
  supabase: SupabaseClient,
  table: string,
  recordId: string,
  data: Record<string, unknown>,
  userId: string,
  expectedUpdatedAt?: string,
): Promise<void> {
  const ts = now();

  if (expectedUpdatedAt !== undefined) {
    const { data: updated, error } = await supabase
      .from(table)
      .update({ data, updated_at: ts })
      .eq('user_id', userId)
      .eq('id', recordId)
      .eq('updated_at', expectedUpdatedAt)
      .is('deleted_at', null)
      .select('id');

    if (error) {
      throw new Error(`Failed to upsert record ${recordId}: ${error.message}`);
    }
    if (!updated || (updated as unknown[]).length === 0) {
      throw new StaleRecordError(table, recordId);
    }
    return;
  }

  const { error } = await supabase
    .from(table)
    .upsert(
      {
        id: recordId,
        user_id: userId,
        data,
        updated_at: ts,
        deleted_at: null,
      },
      { onConflict: 'id,user_id' },
    );

  if (error) {
    throw new Error(`Failed to upsert record ${recordId}: ${error.message}`);
  }
}

/**
 * 软删除一条记录（设置 deleted_at）。
 *
 * 传了 `expectedUpdatedAt` 时同样走 compare-and-swap：记录在读取之后被改过
 * 就不删，抛 `StaleRecordError`，让别人先看一眼发生了什么。
 */
export async function softDeleteRecord(
  supabase: SupabaseClient,
  table: string,
  recordId: string,
  userId: string,
  expectedUpdatedAt?: string,
): Promise<void> {
  const ts = now();
  let query = supabase
    .from(table)
    .update({ deleted_at: ts, updated_at: ts })
    .eq('user_id', userId)
    .eq('id', recordId);

  if (expectedUpdatedAt !== undefined) {
    query = query.eq('updated_at', expectedUpdatedAt).is('deleted_at', null);
  }

  const { data, error } = await query.select('id');

  if (error) {
    throw new Error(`Failed to delete record ${recordId}: ${error.message}`);
  }
  if (expectedUpdatedAt !== undefined && (data as unknown[] | null)?.length === 0) {
    throw new StaleRecordError(table, recordId);
  }
}
