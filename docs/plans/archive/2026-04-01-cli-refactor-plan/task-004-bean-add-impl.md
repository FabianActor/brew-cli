# Task 004: brew-guide bean add — Implementation

**type**: impl
**depends-on**: ["004-bean-add-test", "002-config-impl"]

## Goal

Implement `src/commands/bean/add.ts` and `src/commands/bean/index.ts` with dry-run support.

## Files to Create

- `src/commands/bean/add.ts` — `bean add` command
- `src/commands/bean/index.ts` — `bean` group command (subCommands: add, list)

## Steps

1. Create `src/commands/bean/add.ts` with `defineCommand`:
   - Args: `name` (required), `roaster` (required), `origin` (required), `process` (required), `variety`, `roast-level`, `roast-date`, `price`, `capacity`, `bean-type`, `flavor`, `notes`, `dry-run` (boolean), `format`
   - In `run({ args })`:
     a. Parse `flavor`: split by comma, trim, filter empty strings → array or undefined
     b. Build `beanData` object from all args (camelCase field names)
     c. **If `args['dry-run']`**: print `[dry-run] Would create bean:\n<JSON>` (human) or `{"dryRun":true,"bean":{...}}` (json); `return` without calling Supabase
     d. Call `resolveConfig()` — only if not dry-run
     e. Call `createSupabaseClient(config)`
     f. Call `executeUpsertBean(supabase, config, { bean: beanData })`
     g. Print result: `result.content[0].text` (human) or `JSON.stringify({id, status, timestamp})` (json)
     h. Handle errors: catch and `console.error('Error: ...')`, `process.exit(1)` for general errors; `process.exit(65)` for network errors; `process.exit(64)` for config errors

2. Create `src/commands/bean/index.ts`:
   - `defineCommand` with `meta: { name: 'bean' }`
   - `subCommands: { add: () => import('./add.js').then(r => r.default), list: () => import('./list.js').then(r => r.default) }`

## Verification

- `npm test tests/bean-add.test.mjs` — all tests **pass** (Green)
- `npx tsc --noEmit` — no errors
