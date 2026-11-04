# Task 003: brew-guide init — Implementation

**type**: impl
**depends-on**: ["003-init-command-test"]

## Goal

Implement the `brew-guide init` command: interactive prompts to collect Supabase credentials, write config file with 600 permissions.

## Files to Create/Change

- `src/commands/init.ts` — new file, Citty command definition

## Steps

1. Create `src/commands/init.ts` using `defineCommand` from citty
2. Implement `run()`:
   a. Check if `~/.config/brew-guide/config.json` exists; if so, prompt "已有配置，是否覆盖？(y/n)" using `readline/promises`; if user enters anything other than "y"/"Y", exit 0 without changes
   b. Prompt for Supabase URL — validate it starts with `https://`; if invalid, show error and re-prompt in a loop
   c. Prompt for Service Role Key (plain readline — masking requires extra deps, skip for now)
   d. Prompt for User ID with default "default_user" (empty input → use default)
   e. Close readline
   f. `mkdir` the config dir recursively: `~/.config/brew-guide/`
   g. Write config JSON with `{ mode: 0o600 }` option in `fs.writeFile`
   h. Print: `配置已保存至 ~/.config/brew-guide/config.json`
3. Handle readline `close` event (Ctrl+C): catch the error/closed state, print "Setup cancelled", exit with code 130

## Verification

- `npm test tests/init.test.mjs` — all tests **pass** (Green)
- `npx tsc --noEmit` — no errors
