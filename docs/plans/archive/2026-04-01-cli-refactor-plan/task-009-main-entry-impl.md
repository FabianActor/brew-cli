# Task 009: Main Entry Point

**type**: impl
**depends-on**: ["004-bean-add-impl", "005-bean-list-impl", "006-note-add-impl", "007-note-list-impl", "008-roasters-impl", "003-init-command-impl"]

## Goal

Wire all commands into `src/main.ts` using Citty's `runMain`, and run the full build to produce `dist/main.js`.

## Files to Create/Change

- `src/main.ts` — new CLI entry point
- `npm run build` — produces `dist/main.js`

## Steps

1. Create `src/main.ts`:
   ```
   Import defineCommand and runMain from citty
   Define root command with:
     meta: { name: 'brew-guide', version: from package.json, description: '...' }
     subCommands: {
       init:     lazy import ./commands/init
       bean:     lazy import ./commands/bean/index
       note:     lazy import ./commands/note/index
       roasters: lazy import ./commands/roasters
     }
   Call runMain(main)
   ```
2. Run `npm run build` — tsup compiles `src/main.ts` → `dist/main.js` with shebang
3. Run `chmod +x dist/main.js` (or confirm `postbuild` script handles it)
4. Smoke test: `node dist/main.js --help` should print all subcommands
5. Smoke test: `node dist/main.js --version` should print the version from package.json

## Verification

- `node dist/main.js --help` exits 0 and lists: `init`, `bean`, `note`, `roasters`
- `node dist/main.js bean add --help` exits 0 and shows `--dry-run` in the options
- `node dist/main.js --version` prints the version number
- `node dist/main.js unknown-cmd` exits non-zero with an error message
- `npx tsc --noEmit` — no errors
