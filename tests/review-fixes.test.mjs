import test from 'node:test';
import assert from 'node:assert/strict';

import { executeUpsertBean } from '../src/tools/upsertBean.ts';
import { executeUpsertNote } from '../src/tools/upsertNote.ts';

const config = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'service-role-key',
  brewGuideUserId: 'default_user',
};

test('executeUpsertBean returns a tool error instead of throwing when params are missing', async () => {
  const supabase = {
    from() {
      throw new Error('should not reach database');
    },
  };

  const result = await executeUpsertBean(supabase, config, undefined);

  assert.match(result.content[0].text, /Invalid params/i);
});

test('executeUpsertNote returns a tool error instead of throwing when params are missing', async () => {
  const supabase = {
    from() {
      throw new Error('should not reach database');
    },
  };

  const result = await executeUpsertNote(supabase, config, undefined);

  assert.match(result.content[0].text, /Invalid params/i);
});

test('executeUpsertNote converts unexpected Supabase exceptions into tool errors', async () => {
  const supabase = {
    from() {
      return {
        upsert: async () => {
          throw new Error('network down');
        },
      };
    },
  };

  const result = await executeUpsertNote(supabase, config, {
    note: { method: 'V60' },
  });

  assert.match(result.content[0].text, /Failed to upsert note: network down/);
});

test('executeUpsertBean succeeds and returns the upserted bean id', async () => {
  let capturedRow = null;
  const supabase = {
    from(table) {
      assert.equal(table, 'coffee_beans');
      return {
        upsert(row, opts) {
          capturedRow = row;
          assert.deepEqual(opts, { onConflict: 'id,user_id' });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const result = await executeUpsertBean(supabase, config, {
    bean: { name: 'Ethiopia Yirgacheffe', origin: 'Ethiopia' },
  });

  assert.match(result.content[0].text, /Upserted coffee bean bean_/);
  assert.equal(capturedRow.user_id, 'default_user');
  assert.equal(capturedRow.data.name, 'Ethiopia Yirgacheffe');
  assert.equal(capturedRow.deleted_at, null);
});

test('executeUpsertNote succeeds and returns the upserted note id', async () => {
  let capturedRow = null;
  const supabase = {
    from(table) {
      assert.equal(table, 'brewing_notes');
      return {
        upsert(row, opts) {
          capturedRow = row;
          assert.deepEqual(opts, { onConflict: 'id,user_id' });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const result = await executeUpsertNote(supabase, config, {
    note: { method: 'V60', score: 85 },
  });

  assert.match(result.content[0].text, /Upserted brewing note note_/);
  assert.equal(capturedRow.user_id, 'default_user');
  assert.equal(capturedRow.data.method, 'V60');
  assert.equal(capturedRow.deleted_at, null);
});

test('executeUpsertBean rejects data exceeding 64 KB', async () => {
  const supabase = {
    from() {
      throw new Error('should not reach database');
    },
  };

  const result = await executeUpsertBean(supabase, config, {
    bean: { name: 'huge', notes: 'x'.repeat(70_000) },
  });

  assert.match(result.content[0].text, /exceeds 64 KB limit/);
});

test('executeUpsertNote rejects data exceeding 64 KB', async () => {
  const supabase = {
    from() {
      throw new Error('should not reach database');
    },
  };

  const result = await executeUpsertNote(supabase, config, {
    note: { memo: 'x'.repeat(70_000) },
  });

  assert.match(result.content[0].text, /exceeds 64 KB limit/);
});
