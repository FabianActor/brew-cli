# Task 007: brew-guide note list — Implementation

**type**: impl
**depends-on**: ["007-note-list-test", "002-config-impl"]

## Goal

Implement `src/commands/note/list.ts`.

## Files to Create

- `src/commands/note/list.ts`

## Steps

1. Create `src/commands/note/list.ts` with `defineCommand`:
   - Args: `limit` (string, optional), `format` (string, optional)
   - Same logic as `bean/list.ts` but:
     - Table: `'brewing_notes'` (hardcoded)
     - Empty message: `"No notes found. Use 'brew-guide note add' to create one."`
   - Validate `--limit` same way (exit 2 if invalid)
   - Call `executeListRecent(supabase, config, { table: 'brewing_notes', limit })`

## Verification

- `npm test tests/note-list.test.mjs` — all tests **pass** (Green)
- `npx tsc --noEmit` — no errors
