# Task 005: brew-guide bean list — Implementation

**type**: impl
**depends-on**: ["005-bean-list-test", "002-config-impl"]

## Goal

Implement `src/commands/bean/list.ts`.

## Files to Create

- `src/commands/bean/list.ts`

## Steps

1. Create `src/commands/bean/list.ts` with `defineCommand`:
   - Args: `limit` (string, optional, default "20"), `format` (string, optional)
   - In `run({ args })`:
     a. Parse and validate `limit`: `parseInt(args.limit, 10)`; if `isNaN` or `<= 0`, write to stderr `"Error: --limit must be a positive integer"` and `process.exit(2)`
     b. Call `resolveConfig()`; catch config errors and `process.exit(64)`
     c. Call `createSupabaseClient(config)`
     d. Call `executeListRecent(supabase, config, { table: 'coffee_beans', limit })`
     e. Parse the JSON string result (`result.content[0].text`)
     f. If array is empty: print `"No beans found. Use 'brew-guide bean add' to create one."` and exit 0
     g. If `--format json`: `console.log(JSON.stringify(records))`
     h. If human format: print a simple table or list (one record per line with key fields)
     i. Catch network errors and `process.exit(65)`

## Verification

- `npm test tests/bean-list.test.mjs` — all tests **pass** (Green)
- `npx tsc --noEmit` — no errors
