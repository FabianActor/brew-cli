# Task 006: brew-guide note add — Implementation

**type**: impl
**depends-on**: ["006-note-add-test", "002-config-impl"]

## Goal

Implement `src/commands/note/add.ts` and `src/commands/note/index.ts`.

## Files to Create

- `src/commands/note/add.ts`
- `src/commands/note/index.ts`

## Steps

1. Create `src/commands/note/add.ts` with `defineCommand`:
   - Args: `bean-id` (required), `method` (required), `grind-size`, `water-temp`, `ratio`, `brew-time`, `flavor`, `score`, `memo`, `brewed-at`, `dry-run` (boolean), `format`
   - In `run({ args })`:
     a. Parse numeric args: `waterTemp = args['water-temp'] ? Number(args['water-temp']) : undefined`, same for `score`
     b. Build `noteData` object (camelCase keys: `beanId`, `method`, `grindSize`, `waterTemp`, `ratio`, `brewTime`, `flavor`, `score`, `memo`, `brewedAt`)
     c. **If `args['dry-run']`**: print dry-run output and `return`
     d. Call `resolveConfig()`, `createSupabaseClient(config)`, `executeUpsertNote(supabase, config, { note: noteData })`
     e. Print result or JSON; handle errors with appropriate exit codes

2. Create `src/commands/note/index.ts`:
   - `subCommands: { add: ..., list: ... }` (lazy imports)

## Verification

- `npm test tests/note-add.test.mjs` — all tests **pass** (Green)
- `npx tsc --noEmit` — no errors
