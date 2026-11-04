import assert from 'node:assert/strict';
import test from 'node:test';

import { consumeBean, updateBean } from '../src/services/beans.ts';
import { updateNote } from '../src/services/notes.ts';

function createLegacyBeanDatabase(data) {
  let writtenRow = null;
  let requestCount = 0;

  const supabase = {
    from(table) {
      assert.equal(table, 'coffee_beans');
      requestCount += 1;

      if (requestCount === 1) {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          is() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data: [{ id: 'legacy-bean-id', data, updated_at: '2026-04-01T00:00:00.000Z' }],
              error: null,
            });
          },
        };
      }

      return {
        upsert(row) {
          writtenRow = row;
          return Promise.resolve({ error: null });
        },
        update(patch) {
          writtenRow = { data: patch.data };
          const chain = {
            eq: () => chain,
            is: () => chain,
            select: () => chain,
            then: (resolve) => resolve({ data: [{ id: 'written' }], error: null }),
          };
          return chain;
        },
      };
    },
  };

  return {
    supabase,
    getWrittenRow() {
      return writtenRow;
    },
  };
}

test('updating a legacy bean restores its embedded id', async () => {
  const database = createLegacyBeanDatabase({ name: 'Legacy bean' });

  await updateBean(database.supabase, 'legacy-bean-id', { notes: 'Updated' }, 'user-1');

  assert.equal(database.getWrittenRow().data.id, 'legacy-bean-id');
});

test('consuming a legacy bean restores its embedded id', async () => {
  const database = createLegacyBeanDatabase({ name: 'Legacy bean', remaining: '100' });

  await consumeBean(database.supabase, 'legacy-bean-id', 10, 'user-1');

  assert.equal(database.getWrittenRow().data.id, 'legacy-bean-id');
});

test('updating a legacy brewing note restores its embedded id', async () => {
  let writtenRow = null;
  let requestCount = 0;
  const supabase = {
    from(table) {
      assert.equal(table, 'brewing_notes');
      requestCount += 1;

      if (requestCount === 1) {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          is() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data: [{ id: 'legacy-note-id', data: { notes: 'Old' }, updated_at: '2026-04-01T00:00:00.000Z' }],
              error: null,
            });
          },
        };
      }

      return {
        upsert(row) {
          writtenRow = row;
          return Promise.resolve({ error: null });
        },
        update(patch) {
          writtenRow = { data: patch.data };
          const chain = {
            eq: () => chain,
            is: () => chain,
            select: () => chain,
            then: (resolve) => resolve({ data: [{ id: 'written' }], error: null }),
          };
          return chain;
        },
      };
    },
  };

  await updateNote(supabase, 'legacy-note-id', { notes: 'Updated' }, 'user-1');

  assert.equal(writtenRow.data.id, 'legacy-note-id');
});
