import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrewGuideConfig } from '../config.ts';
import { generateId } from '../lib/ids.ts';
import { now } from '../lib/timestamps.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 真实 brewing_notes.data 形状（参考线上数据）：
//   { id, beanId, method, equipment, coffeeBeanInfo,
//     rating (0-5), taste {body,acidity,sweetness,bitterness},
//     notes, timestamp (unix ms), totalTime (number),
//     params { temp, ratio, water, coffee, grindSize, stages },
//     source }
//
// normalizeNote 同时接受旧的扁平字段（score/flavor/memo/brewedAt/brewTime/waterTemp/
// ratio/grindSize），并在写入前转换到真实形状，保持 CLI 向后兼容。
/**
 * 将用户输入（可能夹带老式扁平字段）归一化到真实 brewing_notes.data 形状。
 * 原字段保留在结果中（additionalProperties）以维持向后兼容；
 * 同时补齐权威字段（rating、notes、params.xxx、totalTime、timestamp）供 brew-guide 前端读取。
 */
function normalizeNote(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };

  // rating: 优先显式 rating；否则 score(0-100) / 20，clamp 到 0-5。
  if (typeof out.rating !== 'number' && typeof out.score === 'number') {
    const r = out.score / 20;
    out.rating = Math.max(0, Math.min(5, Math.round(r * 10) / 10));
  }

  // notes: 合并 memo / flavor。
  const mergedNotes: string[] = [];
  if (typeof out.notes === 'string' && out.notes) mergedNotes.push(out.notes);
  if (typeof out.memo === 'string' && out.memo) mergedNotes.push(out.memo);
  if (typeof out.flavor === 'string' && out.flavor) mergedNotes.push(`风味：${out.flavor}`);
  if (mergedNotes.length > 0) {
    out.notes = mergedNotes.join('\n');
  }

  // timestamp: brewedAt ISO → unix ms，否则默认 now。
  if (typeof out.timestamp !== 'number') {
    if (typeof out.brewedAt === 'string' && out.brewedAt) {
      const parsed = Date.parse(out.brewedAt);
      if (!Number.isNaN(parsed)) out.timestamp = parsed;
    }
    if (typeof out.timestamp !== 'number') out.timestamp = Date.now();
  }

  // totalTime: brewTime 字符串 "2:30" → 150 秒，或直接数字。
  if (typeof out.totalTime !== 'number' && out.brewTime != null) {
    if (typeof out.brewTime === 'number') {
      out.totalTime = out.brewTime;
    } else if (typeof out.brewTime === 'string') {
      const m = out.brewTime.match(/^(\d+):(\d{1,2})$/);
      if (m) {
        out.totalTime = Number(m[1]) * 60 + Number(m[2]);
      } else {
        const n = Number(out.brewTime);
        if (Number.isFinite(n)) out.totalTime = n;
      }
    }
  }

  // params.*: 合并 waterTemp/ratio/grindSize。
  const params = isRecord(out.params) ? { ...(out.params as Record<string, unknown>) } : {};
  if (params.temp == null && typeof out.waterTemp === 'number') {
    params.temp = `${out.waterTemp}°C`;
  }
  if (params.ratio == null && typeof out.ratio === 'string') {
    params.ratio = out.ratio;
  }
  if (params.grindSize == null && typeof out.grindSize === 'string') {
    params.grindSize = out.grindSize;
  }
  if (Object.keys(params).length > 0) {
    out.params = params;
  }

  return out;
}

/**
 * 写入一条冲煮记录（结构化入口）。
 *
 * CLI 与 MCP 工具共用：返回真实 id / timestamp，调用方不必再从工具文案里抠 ID。
 * 失败直接抛错，错误信息由调用方决定怎么呈现。
 */
export async function upsertNoteRecord(
  supabase: SupabaseClient,
  config: BrewGuideConfig,
  note: Record<string, unknown>,
): Promise<{ id: string; timestamp: string }> {
  const id = (note.id as string) || generateId('note');
  const normalized = normalizeNote(note);
  const dataJson = JSON.stringify(normalized);
  if (dataJson.length > 64_000) {
    throw new Error('Note data exceeds 64 KB limit. Reduce payload size before retrying.');
  }

  const ts = now();

  // deleted_at: null 确保 upsert 同时恢复已软删除的记录
  const { error } = await supabase
    .from('brewing_notes')
    .upsert(
      {
        id,
        user_id: config.brewGuideUserId,
        data: { ...normalized, id },
        updated_at: ts,
        deleted_at: null,
      },
      { onConflict: 'id,user_id' },
    );

  if (error) {
    throw new Error(`Failed to upsert note: ${error.message}`);
  }

  return { id, timestamp: ts };
}
