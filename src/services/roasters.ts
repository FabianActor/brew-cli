import type { SupabaseClient } from '@supabase/supabase-js';
import { MissingRoastersFunctionError, isMissingFunctionError } from '../lib/roastersSql.ts';

/**
 * 库里出现过的所有烘焙商（走 RPC `get_all_roasters`，已去重）。
 *
 * 直接返回数组：命令层不再从工具文案里 split 出名单，
 * 文案改了也不会静默退化成「没有烘焙商」。
 */
export async function listRoasters(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_all_roasters');
  if (error) {
    // 函数没建时 PostgREST 只回 404，命令层需要拿到 SQL 才能自救
    if (isMissingFunctionError(error)) {
      throw new MissingRoastersFunctionError();
    }
    throw new Error(`Failed to list roasters: ${error.message}`);
  }
  const names = ((data ?? []) as { roaster: string }[])
    .map((row) => row.roaster)
    .filter((name): name is string => typeof name === 'string' && name.trim() !== '');
  // 库端 RPC 一般已去重，这里再兜一次，保证输出稳定
  return [...new Set(names)];
}
