/**
 * 冲煮记录业务逻辑层。
 * 对应 agent-harness 的 core/notes.py。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchActiveRecords,
  fetchRecordById,
  upsertRecord,
  softDeleteRecord,
} from './base.ts';

const TABLE = 'brewing_notes';

export interface NoteFilters {
  equipment?: string;
  method?: string;
  beanId?: string;
  minRating?: number;
}

/**
 * 查询冲煮记录列表，支持筛选。
 */
export async function listNotes(
  supabase: SupabaseClient,
  userId: string,
  filters?: NoteFilters,
): Promise<Array<Record<string, unknown>>> {
  const rows = await fetchActiveRecords(supabase, TABLE, userId);
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const note: Record<string, unknown> = { ...row.data, id: row.id, updated_at: row.updated_at };

    if (filters?.equipment && note.equipment !== filters.equipment) continue;
    if (filters?.method) {
      const noteMethod = typeof note.method === 'string' ? note.method : '';
      if (!noteMethod.toLowerCase().includes(filters.method.toLowerCase())) continue;
    }
    if (filters?.beanId && note.beanId !== filters.beanId) continue;
    if (filters?.minRating != null) {
      const rating = typeof note.rating === 'number' ? note.rating : 0;
      if (rating < filters.minRating) continue;
    }

    results.push(note);
  }

  return results;
}

/**
 * 查询单条冲煮记录详情。
 */
export async function getNote(
  supabase: SupabaseClient,
  noteId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const row = await fetchRecordById(supabase, TABLE, noteId, userId);
  if (!row) return null;
  return { ...row.data, id: row.id, updated_at: row.updated_at };
}

/**
 * 更新冲煮记录的部分字段。
 */
export async function updateNote(
  supabase: SupabaseClient,
  noteId: string,
  updates: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const row = await fetchRecordById(supabase, TABLE, noteId, userId);
  if (!row) return null;

  const mergedTaste =
    updates.taste && typeof updates.taste === 'object'
      ? { ...(row.data.taste as Record<string, unknown> | undefined ?? {}), ...(updates.taste as Record<string, unknown>) }
      : row.data.taste;
  const mergedParams =
    updates.params && typeof updates.params === 'object'
      ? { ...(row.data.params as Record<string, unknown> | undefined ?? {}), ...(updates.params as Record<string, unknown>) }
      : row.data.params;
  const merged: Record<string, unknown> = {
    ...row.data,
    ...updates,
    id: noteId,
    updatedAt: new Date().toISOString(),
  };
  if (mergedTaste !== undefined) merged.taste = mergedTaste;
  if (mergedParams !== undefined) merged.params = mergedParams;
  await upsertRecord(supabase, TABLE, noteId, merged, userId);
  return { ...merged, id: noteId };
}

/**
 * 软删除冲煮记录。
 */
export async function deleteNote(
  supabase: SupabaseClient,
  noteId: string,
  userId: string,
): Promise<boolean> {
  const row = await fetchRecordById(supabase, TABLE, noteId, userId);
  if (!row) return false;
  await softDeleteRecord(supabase, TABLE, noteId, userId);
  return true;
}
