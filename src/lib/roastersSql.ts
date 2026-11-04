/**
 * `public.get_all_roasters()` 的 DDL。
 *
 * brew-guide 自带的 schema 里没有这个函数，`roasters` 命令靠它汇总烘焙商。
 * 这里放唯一一份定义：命令层在缺函数时直接把它打出来，README 的前置条件段
 * 也用同一段文本。改这段 SQL 时记得同步 README。
 */
export const GET_ALL_ROASTERS_SQL = `create or replace function public.get_all_roasters()
returns table (roaster text)
language sql
stable
as $$
  select distinct trim(both from r.roaster) as "roaster"
  from (
    select jsonb_extract_path_text("data", 'roaster') as roaster
    from "public"."coffee_beans"
    where "deleted_at" is null

    union all

    select jsonb_extract_path_text("data", 'roaster') as roaster
    from "public"."brewing_notes"
    where "deleted_at" is null
  ) as r
  where r.roaster is not null
    and btrim(r.roaster) <> ''
  order by 1;
$$;`;

/**
 * 缺 `get_all_roasters()` 时抛这个，命令层据此打印建表 SQL 而不是一句
 * "Failed to list roasters: ..."。
 */
export class MissingRoastersFunctionError extends Error {
  readonly sql = GET_ALL_ROASTERS_SQL;

  constructor() {
    super('Supabase project has no public.get_all_roasters() function.');
    this.name = 'MissingRoastersFunctionError';
  }
}

/**
 * PostgREST 找不到 RPC 时返回 404 + `code: "PGRST202"`，message 形如
 * "Could not find the function public.get_all_roasters without parameters in the schema cache"。
 * 老版本网关可能只给 message，所以两条都认。
 */
export function isMissingFunctionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  return /could not find the function/i.test(error.message ?? '');
}

/** 缺函数时打给用户的那段话（含 SQL），命令层直接 exitWithError 输出。 */
export function roastersFunctionGuide(): string {
  return [
    'Error: 这个 Supabase 项目里没有 public.get_all_roasters() 函数，roasters 靠它汇总烘焙商。',
    '把下面这段贴到 Supabase → SQL Editor 跑一次，然后重跑本命令：',
    '',
    GET_ALL_ROASTERS_SQL,
  ].join('\n');
}
