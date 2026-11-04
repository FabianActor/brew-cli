import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BrewGuideConfig } from './config.ts';

/**
 * 基于配置创建 Supabase 客户端。
 * 用的是一把普通 key（publishable / legacy anon）：能读写是因为 brew-guide 的
 * 表用 `USING (true)` 宽 RLS，不是因为它能绕过 RLS。
 */
export function createSupabaseClient(config: BrewGuideConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseKey);
}
