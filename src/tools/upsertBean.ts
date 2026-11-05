import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrewGuideConfig } from '../config.ts';
import { generateId } from '../lib/ids.ts';
import { now } from '../lib/timestamps.ts';
import { normalizeWeight } from '../lib/weights.ts';
import type { CoffeeBean } from '../types/coffeeBean.ts';

/**
 * 写入一款咖啡豆。
 *
 * 命令层的唯一写入入口：返回真实 id / timestamp，调用方不必从文案里抠 ID。
 */
export async function upsertBeanRecord(
  supabase: SupabaseClient,
  config: BrewGuideConfig,
  bean: Partial<CoffeeBean> & Record<string, unknown>,
): Promise<{ id: string; timestamp: string }> {
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
  // 这里只补「App 自己也会补的形状默认值」，不替用户猜内容：
  // 烘焙度、赏味期以前在这里被兜底成「浅度烘焙 / 30 / 60」，命令层刚修掉，
  // 又被这一层悄悄写回去（实测：生豆被写成 startDay=30，在途豆被写成已到手）。
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
  // 在途只按调用方给的值写；没给就按 App 的默认（已到手）落 false。
  if (typeof normalizedBean.isInTransit !== 'boolean') {
    normalizedBean.isInTransit = false;
  }
  if (normalizedBean.remaining == null && typeof normalizedBean.capacity === 'string' && normalizedBean.capacity) {
    normalizedBean.remaining = normalizedBean.capacity;
  }

  const dataJson = JSON.stringify(normalizedBean);
  if (dataJson.length > 64_000) {
    throw new Error('Bean data exceeds 64 KB limit. Reduce payload size before retrying.');
  }

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
    throw new Error(`Failed to upsert bean: ${error.message}`);
  }

  return { id, timestamp: ts };
}
