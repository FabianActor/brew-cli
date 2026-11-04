/**
 * 列表查询：把筛选条件下推到 Supabase，取够 limit 条就停。
 *
 * 之前的写法是"先取 limit 条、再在本地过滤"，等于 limit 生效在筛选之前——
 * `--limit 20 --roast-level 深度烘焙` 可能一条都返回不了，数据库里其实有。
 * 这里改成游标分页：每页 50 条，边取边过滤，攒够就返回。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { pickSummaryFields } from './summary.ts';

export interface JsonbFilter {
  /** data 里的字段名，例如 roastLevel / method。 */
  key: string;
  op?: 'eq' | 'ilike';
  value: string;
}

export interface ListSummariesOptions {
  table: string;
  userId: string;
  limit: number;
  /** 可以下推到 PostgREST 的等于/模糊条件。 */
  filters?: JsonbFilter[];
  /** 下推不了的判断（数字比较、单位解析等），逐条在本地执行。 */
  predicate?: (data: Record<string, unknown>) => boolean;
  /** 每页抓多少行，默认 50。 */
  pageSize?: number;
  /** 最多扫多少行，防止极端情况下全表扫描，默认 2000。 */
  maxScan?: number;
}

export interface ListSummariesResult {
  rows: Array<Record<string, unknown>>;
  scanned: number;
  /** 扫到 maxScan 还没攒够 limit 条。 */
  truncated: boolean;
}

export async function listSummaries(
  supabase: SupabaseClient,
  options: ListSummariesOptions,
): Promise<ListSummariesResult> {
  const { table, userId, limit, filters = [], predicate, pageSize = 50, maxScan = 2000 } = options;

  const rows: Array<Record<string, unknown>> = [];
  let scanned = 0;
  let from = 0;
  let truncated = false;

  while (rows.length < limit) {
    if (scanned >= maxScan) {
      truncated = true;
      break;
    }

    const pageLimit = Math.min(pageSize, maxScan - scanned);

    let query = supabase
      .from(table)
      .select('id, data, updated_at, deleted_at')
      .eq('user_id', userId)
      .is('deleted_at', null);

    for (const filter of filters) {
      const column = `data->>${filter.key}`;
      query = (filter.op ?? 'eq') === 'ilike' ? query.ilike(column, filter.value) : query.eq(column, filter.value);
    }

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .range(from, from + pageLimit - 1);

    if (error) {
      throw new Error(`Failed to list records from ${table}: ${error.message}`);
    }

    const page = data ?? [];
    scanned += page.length;

    for (const row of page) {
      const rawData = row.data;
      const payload: Record<string, unknown> =
        rawData && typeof rawData === 'object' && !Array.isArray(rawData)
          ? (rawData as Record<string, unknown>)
          : {};
      if (predicate && !predicate(payload)) continue;
      rows.push({ id: row.id, ...pickSummaryFields(table, payload), updated_at: row.updated_at });
      if (rows.length >= limit) break;
    }

    if (page.length < pageLimit) break;
    from += page.length;
  }

  return { rows: rows.slice(0, limit), scanned, truncated };
}
