# Task 008: brew-guide roasters — Implementation

**type**: impl
**depends-on**: ["008-roasters-test", "002-config-impl"]

## Goal

Implement `src/commands/roasters.ts`.

## Files to Create

- `src/commands/roasters.ts`

## Steps

1. Create `src/commands/roasters.ts` with `defineCommand`:
   - Args: `format` (string, optional)
   - In `run({ args })`:
     a. Call `resolveConfig()`; catch config errors and `process.exit(64)`
     b. Call `createSupabaseClient(config)`
     c. Call `executeGetAllRoasters(supabase)`
     d. Parse result text (it's a formatted string like `"Found N roaster(s):\n..."`)
     e. Extract the roaster names list
     f. If empty: print `"No roasters found. Add beans with --roaster to see them here."`
     g. If `--format json`: print `JSON.stringify(roasterNamesArray)`
     h. If human: print one roaster per line
     i. Catch network errors and `process.exit(65)`

## Verification

- `npm test tests/roasters.test.mjs` — all tests **pass** (Green)
- `npx tsc --noEmit` — no errors
