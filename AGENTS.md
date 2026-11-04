# AGENTS.md

Guidance for coding agents working in this repository. This is the single source of truth for agent instructions — no per-tool copies.

## Project overview

`brew-cli` — a standalone Citty CLI for operating [brew-guide](https://github.com/chuthree/brew-guide) data in Supabase: coffee beans, brewing notes, equipment, brewing methods, roasters. It talks to the same tables the app syncs, so a record written here shows up in the app.

Published to npm as **`@fabianactor/brew-cli`** (the unscoped `brew-cli` name is a permanently retired npm tombstone — do not try to use it), command name **`brew-guide`**. `npm link` still works for a local build; `package.json` version is bumped by hand and released by pushing a `v*` tag.

## Tech stack

- Node.js >= 18, TypeScript (ESM, `NodeNext`, strict)
- CLI framework: `citty`
- Supabase: `@supabase/supabase-js`
- Config loader: `c12`
- Schema validation: `@sinclair/typebox`
- Bundler: `tsup` (esm, node18 target, shebang banner)
- Tests: node built-in test runner via `tsx`

## Commands

```bash
npm run dev               # run CLI from source via tsx (src/main.ts)
npm run build             # tsup bundle → dist/main.js (+ scripts/chmod-bin.mjs postbuild)
npm run build:watch       # watch mode
npm run typecheck         # tsc --noEmit
npm test                  # npm run typecheck && node --import tsx --test
npm link                  # expose the built CLI as `brew-guide` globally
```

Run a single test: `node --import tsx --test tests/bean-add.test.mjs`.

`tests/init.test.mjs` and `tests/config.test.mjs` contain POSIX-only assertions (0600 file mode) that skip on Windows — 11 skipped tests there is expected on this machine.

## Project layout

```
src/
  main.ts              # citty entry, subcommands registered here
  client.ts            # Supabase client factory
  config.ts            # c12 config loader; ~/.config/brew-guide/config.json
  logger.ts paths.ts
  commands/            # bean/ equipment/ method/ note/ + init.ts roasters.ts backup.ts
  services/            # Supabase data access: base tables beans notes equipment methods roasters
  tools/               # upsertBean.ts / upsertNote.ts — thin adapters over services
  lib/                 # args exit output query summary weights ids blendComponents crudCommands timestamps toolResults roast noteInput equipmentTypes
  types/
tests/                 # *.test.mjs, node --test
skills/brew-guide/     # SKILL.md + references/ (agent-facing usage docs)
docs/supabase.md       # authoritative Supabase conventions — read first for DB work
CHANGELOG.md           # user-facing change log, one section per released version
```

## Supabase rules (critical — do not skip)

If a task touches Supabase access, schema assumptions, RPCs, RLS, SQL, or `@supabase/supabase-js` usage: read `docs/supabase.md` first, then look at the relevant `src/services/*` file, then change code.

### Data model facts

- The config field is `supabaseKey` (env `BREW_GUIDE_SUPABASE_KEY`), holding a publishable / legacy anon key — **not** a service_role key, and it does not bypass RLS. brew-guide's schema enables RLS with `USING (true)` / `WITH CHECK (true)` and grants CRUD to `anon`, so this key works there; the permission boundary **is** the RLS policy. The legacy config field `supabaseServiceRoleKey` is still read (with a stderr warning) — only for backwards compatibility, never write it.
- Tables: `coffee_beans`, `brewing_notes`, `custom_equipments`, `custom_methods`, `user_settings`. All rows are scoped by `user_id`; primary key is `(id, user_id)`, hence `onConflict: 'id,user_id'`.
- Business payload lives in the `data` JSONB column; `id` is mirrored into `data.id`.
- Soft delete via `deleted_at`. Every write sets `deleted_at: null`, so writing to a soft-deleted id **revives** it. Lists read `deleted_at is null` only.
- Time values inside `data` are **milliseconds since epoch**, not ISO strings (`timestamp`, `updatedAt`).
- Origin lives in `data.blendComponents[]`; flat flags (`--origin`, `--region`, …) are merged into the first component and removed from the top level on write.
- `custom_methods` is **one row per equipment**, not per method: `data.equipmentId` + `data.methods[]`, each method `{ id: 'method-<ms>-<7 chars>', name, params{…}, timestamp }`. Method ids must come from `src/lib/ids.ts` so the equipment ↔ methods join keeps working.
- `roasters` depends on the Postgres RPC `public.get_all_roasters()`. That function is **not** in brew-guide's schema; any fresh Supabase project needs the DDL from README.

### Change rules

1. Preserve `user_id` scoping unless the task explicitly changes tenancy.
2. Preserve soft-delete semantics unless the task explicitly changes deletion behavior.
3. Do not change the `get_all_roasters()` contract without updating README and SQL.
4. If payload shape assumptions change, update `docs/supabase.md`, README and the affected `skills/brew-guide/` reference in the same change.
5. Any user-visible change gets a line in `CHANGELOG.md` under the unreleased-or-version section — added / changed / fixed / breaking, plus the upgrade command. Pending work belongs in the `[未发布]` section so it does not get lost.

## Code conventions

- ESM only (`"type": "module"`); import with `.ts` extensions (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`).
- Strict TypeScript — no `any` drift.
- One subcommand per file under `src/commands/<group>/`, re-exported from the group `index.ts`.
- Data access goes through `src/services/*`. Commands must not build queries themselves (the one exception is `src/lib/query.ts`'s paged list helper).
- Every command validates its own flags: build `const argsDef = { … } as const;` and call `assertKnownFlags(args, argsDef, '<group> <command>')` in `run()` — **`as const` is required**, otherwise citty's positional types widen.
- Exit through `exitWithError(message, EXIT.…)` from `src/lib/exit.ts`; route caught errors through `exitForError(error)`. Never call `process.exit` directly.
- Output: `printJson(value)` for `--format json` (single-line, stdout), `warn()` for diagnostics (stderr). Human-readable text goes to stdout.
- get/delete commands are generated by `createGetCommand` / `createDeleteCommand` in `src/lib/crudCommands.ts` — extend the factory instead of hand-writing a sixth copy.
- Blocking a bug that the app would also hit? Look at the app source under `../brew-guide/src` before guessing.

## Tests

- Add a case under `tests/` for any behavior that had a bug; keep them runnable without network access (fake Supabase builder in `tests/lib-behavior.test.mjs`, `tests/fixes-round2.test.mjs`).
- Fake rows **must** include `user_id: 'default_user'`, otherwise `eq('user_id')` filters everything out and the test silently passes on empty data.
- Never call `assertKnownFlags` directly from a test — it calls `process.exit` and kills the runner; test `findUnknownFlags` instead.

## Secrets and safety

- Never commit real keys or live credentials.
- Treat `~/.config/brew-guide/config.json` and `BREW_GUIDE_CONFIG_PATH` as sensitive.
- `brew-guide backup` is the cheap insurance before any batch write; run it first when a task will modify many rows.
