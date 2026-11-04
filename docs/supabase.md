# Supabase project notes for `brew-cli`

This file captures the **project-specific** Supabase conventions for `brew-cli`.

Use it together with official Supabase docs. The official docs explain platform behavior; this file explains how **this repository** uses Supabase today.

## Purpose

`brew-cli` is a Node.js CLI that reads and writes brew-guide data directly in a Supabase project.

The CLI assumes a brew-guide-style schema where business fields live inside a `data` JSONB column and records are scoped by `user_id`.

## Connection model

The CLI sends one key and does **not** use end-user auth. That key is a
`publishable` (formerly `anon`) key — the modern Supabase dashboard splits API
keys into *Publishable* and *Secret*; the legacy `anon` lives under
"Legacy API keys" and is equivalent.

A `service_role` / secret key is **not** needed. Everything works because
brew-guide's own schema enables RLS with `USING (true)` / `WITH CHECK (true)`
and grants CRUD to `anon`, so the permission boundary *is* the RLS policy. On
any table without such a policy, this key is simply denied — it does not
bypass RLS.

Configuration comes from either:

- `brew-guide init` written config file, or
- environment variables

Resolved config keys:

- `BREW_GUIDE_SUPABASE_URL`
- `BREW_GUIDE_SUPABASE_KEY` (legacy alias: `BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY`)
- `BREW_GUIDE_USER_ID`
- optional `BREW_GUIDE_CONFIG_PATH`

The config file field is `supabaseKey`. Older installs wrote
`supabaseServiceRoleKey`; it is still read (with a warning on stderr) so
existing config files keep working, but new writes use `supabaseKey`.

Default config path:

- `~/.config/brew-guide/config.json`

Code reference:

- `src/config.ts`
- `src/paths.ts`

## Core data model

Across the main tables, this repo assumes rows look roughly like:

- `id`: record id
- `user_id`: logical owner / sync partition key
- `data`: JSONB payload with business fields
- `created_at`: first insert time
- `updated_at`: last mutation time
- `deleted_at`: nullable soft-delete marker
- some deployments may also include extra columns like `version`

Important: the CLI mostly treats `data` as the source of truth and only reads a small set of top-level columns.

## Tables used by this repo

五张表都由 CLI 读写：

- `coffee_beans`
- `brewing_notes`
- `custom_equipments`
- `custom_methods`

### `coffee_beans`

Purpose: store coffee bean records.

Important conventions:

- the business payload lives in `data`
- CLI writes `id` both at row level and inside `data.id`
- records are scoped by `user_id`
- soft-deleted rows are excluded from normal reads

Representative fields inside `data` include:

- `id`
- `timestamp`
- `name`
- `roaster`
- `capacity`
- `remaining`
- `price`
- `roastLevel`
- `roastDate`
- `flavor`
- `notes`
- `startDay`
- `endDay`
- `isFrozen`
- `isInTransit`
- `beanType`
- `beanState`
- `purchaseDate`
- `overallRating`
- `ratingNotes`
- `blendComponents`

Code reference:

- `src/types/coffeeBean.ts`
- `src/tools/upsertBean.ts`
- `src/services/beans.ts`

Normalization applied on bean upsert:

- generates an id if missing
- sets `timestamp` if missing
- converts legacy top-level origin/process/estate/variety fields into `blendComponents` when needed
- converts the flat `country` / `region` / `processingStation` / `altitude` / `batch` fields into the first component too
- removes those duplicated top-level component fields after conversion
- normalizes `capacity` and `remaining` strings by stripping spaces and trailing `g/克`
- defaults:
  - `beanType = filter`
  - `beanState = roasted`
  - `isFrozen = false`
  - `startDay = 30`
  - `endDay = 60`
- if `roastDate` exists, treats `isInTransit` as `false`
- if `remaining` is absent but `capacity` exists, copies capacity into remaining
- rejects payloads above 64 KB

### `brewing_notes`

Purpose: store brew note records.

Important conventions:

- payload lives in `data`
- CLI writes `{ ...note, id }` into `data`
- records are partitioned by `user_id`
- delete is soft delete
- payloads above 64 KB are rejected

Authoritative fields (match what the brew-guide frontend writes):

- `id`
- `beanId`
- `method`
- `equipment` (equipment ID, typically the `custom_methods` row id — e.g. `V60`)
- `coffeeBeanInfo`
- `rating` (numeric, 0–5)
- `taste` (object: `{ body, acidity, sweetness, bitterness }`, each 0–5)
- `notes` (free-form text)
- `timestamp` (unix ms)
- `totalTime` (number, seconds)
- `source` (tag: `capacity-adjustment`, `quick-decrement`, ...)
- `params` (object: `{ temp, ratio, water, coffee, grindSize, stages }`)
- `image`

CLI-only legacy fields accepted by `executeUpsertNote` and translated into the
authoritative shape on write (see `normalizeNote` in `src/tools/upsertNote.ts`):

- `score` (0–100) → `rating` (`score / 20`, clamped 0–5)
- `memo`, `flavor` → merged into `notes`
- `brewedAt` (ISO string) → `timestamp` (unix ms)
- `brewTime` (`"2:30"` or seconds) → `totalTime`
- `waterTemp` → `params.temp` (as `"${n}°C"`)
- `ratio` → `params.ratio`
- `grindSize` → `params.grindSize`

Code reference:

- `src/tools/upsertNote.ts`
- `src/services/notes.ts`

### `custom_equipments`

Purpose: store user-defined brewing equipment.

Important conventions:

- one row per equipment item
- payload lives in `data`
- delete is soft delete

Fields written by this repo on create include:

- `name`
- `isCustom: true`
- `animationType`
- `hasValve`
- `note`
- `timestamp`

ID convention:

- the row `id` is a **stable slug** (e.g. `V60`, `Kalita`, `蛋糕滤杯`, or `custom-<slug>-<ts>`)
- `addEquipment` accepts an optional `id` argument; if omitted, one is derived from `name`
- **do not** use raw `crypto.randomUUID()` here — the same id is used as the `custom_methods` row key, so a non-deterministic UUID breaks the equipment ↔ methods join

Code reference:

- `src/services/equipment.ts`

### `custom_methods`

Purpose: store brewing methods / recipes.

This table has a **special shape** in this repo:

- one row represents **all methods for a single equipment**
- row `id` is the `equipmentId`
- `data.methods` is an array of method objects
- deleting a method means removing one item from `data.methods`
- deleting a method is therefore **not** the same as soft-deleting the whole row

Method objects commonly include:

- `id`
- `name`
- `params.coffee`
- `params.water`
- `params.ratio`
- `params.grindSize`
- `params.temp`
- `params.stages`

Code reference:

- `src/services/methods.ts`

## Read/write behavior shared across tables

The shared access layer lives in `src/services/base.ts`.

### Read rules

Normal list/read operations:

- filter by `user_id`
- exclude rows where `deleted_at` is not null
- sort lists by `updated_at desc`

### Upsert rules

Upserts use:

- `onConflict: 'id,user_id'`
- `updated_at = now()`
- `deleted_at = null`

That means upserting an existing soft-deleted record effectively restores it.

### Delete rules

For beans, notes, and equipment, delete means:

- set `deleted_at = now()`
- set `updated_at = now()`

This repo does **not** physically delete those records.

### Value conventions inside `data`

The main app (`brew-guide`) reads these values directly, so the CLI has to match its formats, not invent new ones:

- time values inside `data` are **numbers (ms epoch)**, never ISO strings:
  - `coffee_beans.data.timestamp`
  - `brewing_notes.data.timestamp`, `brewing_notes.data.updatedAt` (`BrewingNoteFormModal.tsx` writes `Date.now()`)
  - `custom_equipments.data.timestamp`, `custom_methods.data.methods[].timestamp`
- `data.id` mirrors the row's `id` column on every write.
- method ids look like `method-<ms>-<7 位短随机>` (`customMethodStore.ts:74-76`).
- bean origins live in `data.blendComponents[]` (`origin/country/region/estate/processingStation/altitude/process/variety/batch/percentage`); flat origin fields on `data` are legacy and are removed on write.

## RPC required by this repo

The command `brew-guide roasters` depends on a Postgres function:

- `public.get_all_roasters()`

Expected behavior:

- read `data->>'roaster'` from `public.coffee_beans`
- read `data->>'roaster'` from `public.brewing_notes`
- ignore null / empty values
- deduplicate
- return a list of roaster names

Current setup source:

- the SQL example in `README.md`
- runtime call in `src/tools/getAllRoasters.ts`

Important: if this function is renamed, removed, or its return shape changes, `brew-guide roasters` will break.

## Summary-field assumptions in tooling

`src/tools/listRecent.ts` exposes abbreviated records. Fields reflect the real payload shape; legacy fields are kept as fallbacks for historical rows:

- `coffee_beans`: `name`, `roaster`, `origin`, `process`, `variety`, `roastLevel`, `startDay`, `endDay`
- `brewing_notes`: `method`, `equipment`, `beanId`, `rating`, `totalTime`, `source`, `timestamp`, `notes` (+ legacy `score`, `flavor`, `ratio`, `brewTime`)
- `custom_equipments`: `name`, `animationType`, `hasValve`, `note`, `isCustom` (+ legacy `brand`, `model`, `equipmentType`, `category`)
- `custom_methods`: `equipmentId`, `name` (+ legacy `title`, `category`, `description`, `method`). Note: one row represents all methods for a single equipment — the `methods` array itself is not scalar, so most per-method data does not appear here.

If payload shapes change, this summary layer may need updates too.

## Current architectural caveats

1. **The configured key can touch every row these tables expose**
   - With `USING (true)` policies, anyone holding the publishable key can read,
     write and delete rows in those tables. That is the design of the schema,
     not a property of the key.
   - Treat config as sensitive; do not commit real keys.
   - The field used to be called `supabaseServiceRoleKey`, which implied
     RLS-bypass powers it never had. It is now `supabaseKey`.

2. **Project rules are implemented in code, not migrations**
   - This repo currently documents required SQL in `README.md`.
   - There is no tracked `supabase/migrations/` directory yet.
   - Schema changes are therefore easier to forget and harder for agents to verify.

3. **JSONB payload shape is partly flexible**
   - Some types are documented, but the code allows extra properties in several places.
   - When changing field names, check command handlers, summary tools, and skill docs together.

4. **`custom_methods` is not row-per-method**
   - Agents often assume each method is a database row.
   - In this repo, methods are nested under the equipment row's `data.methods` array.

## When changing Supabase-related code

Before editing queries, RPC calls, or data shape:

1. Read this file.
2. Read the relevant source files mentioned above.
3. Check official Supabase docs for current behavior.
4. If the change affects schema or SQL helpers, update `README.md` and this file in the same change.
5. If the project starts tracking migrations later, update those too.

## Recommended future improvements

If this project will keep evolving, the biggest improvements would be:

1. add `supabase/migrations/` with the SQL for `get_all_roasters()` and any table assumptions
2. document the canonical JSON payload shape for each table more formally
3. tighten RLS from `USING (true)` to user-scoped policies, so the publishable key alone stops being enough to read every row
4. add tests that exercise the expected table and RPC contracts
