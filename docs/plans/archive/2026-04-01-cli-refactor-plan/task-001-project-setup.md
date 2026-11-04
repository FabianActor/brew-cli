# Task 001: Project Setup

**type**: setup
**depends-on**: []

## Goal

Remove all OpenClaw dependencies and set up the project as a standalone Citty CLI. This creates the foundation every other task builds on.

## Files to Change

- `package.json` — remove openclaw deps/typebox, add citty/c12, add bin entry, update scripts/files/keywords
- `tsconfig.json` — update rootDir to `src`, ensure NodeNext module resolution
- `tsup.config.ts` — create new file for ESM build with shebang banner
- `openclaw.plugin.json` — **delete**
- `index.ts` (root) — **delete** (OpenClaw plugin entry)
- `src/types/openclaw.d.ts` — **delete** (OpenClaw type declarations)
- `src/commands/` — create directory tree:
  - `src/commands/bean/`
  - `src/commands/note/`

## Steps

1. Delete `openclaw.plugin.json`, root `index.ts`, `src/types/openclaw.d.ts`
2. Update `package.json`:
   - Change `name` to `brew-guide-cli`
   - Add `"bin": { "brew-guide": "./dist/main.js" }`
   - Change `"files"` to `["dist/", "skills/"]`
   - Remove `openclaw` top-level key
   - Add `"citty": "^0.1.6"` and `"c12": "^2.0.0"` to dependencies
   - Add `"tsup": "^8.0.0"` and `"tsx": "^4.0.0"` to devDependencies
   - Update `scripts`: add `"build": "tsup"`, `"postbuild": "chmod +x dist/main.js"`, `"dev": "tsx src/main.ts"`
   - Update `prepublishOnly` to `npm run typecheck && npm run build`
   - Update `keywords`: replace `openclaw-plugin` with `cli`
   - Add `"engines": { "node": ">=18" }`
3. Update `tsconfig.json`: set `"rootDir": "src"`, confirm `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`
4. Create `tsup.config.ts` with `entry: { main: 'src/main.ts' }`, `format: ['esm']`, `target: 'node18'`, `banner: { js: '#!/usr/bin/env node' }`
5. Create empty directories: `src/commands/bean/` and `src/commands/note/`
6. Run `npm install` to install new dependencies

## Verification

- `npm install` completes without errors
- `npx tsc --noEmit` reports no errors related to deleted files
- `src/commands/bean/` and `src/commands/note/` directories exist
- `package.json` has no reference to `openclaw`
