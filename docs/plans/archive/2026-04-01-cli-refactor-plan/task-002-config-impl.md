# Task 002: Config Resolution — Implementation

**type**: impl
**depends-on**: ["002-config-test"]

## Goal

Rewrite `src/config.ts` to resolve credentials from env vars → .env → ~/.config/brew-guide/config.json using c12.

## Files to Change

- `src/config.ts` — full rewrite (remove `resolveConfig(pluginConfig)`, replace with `resolveConfig()` using c12)

## Steps

1. Rewrite `src/config.ts`:
   - Keep `BrewGuideConfig` interface unchanged (`supabaseUrl`, `supabaseServiceRoleKey`, `brewGuideUserId`)
   - Export `async function resolveConfig(): Promise<BrewGuideConfig>`
   - Use `loadConfig` from `c12` with `{ name: 'brew-guide', globalRc: true, dotenv: true, defaults: { brewGuideUserId: 'default_user' } }`
   - After loadConfig, apply env var overrides manually: `process.env.BREW_GUIDE_SUPABASE_URL ?? config.supabaseUrl`, etc.
   - Validate HTTPS: throw if URL doesn't start with `https://`
   - Validate required fields: throw descriptive error if `supabaseUrl` or `supabaseServiceRoleKey` missing, suggest `brew-guide init`
   - Check config file permissions: use `fs.stat` on the resolved config file path; if mode has group/other read bits set, write warning to stderr (non-fatal)

2. Remove the old `resolveConfig(pluginConfig: Record<string, unknown>)` export

## Verification

- `npm test tests/config.test.mjs` — all tests **pass** (Green phase)
- `npx tsc --noEmit` — no type errors
