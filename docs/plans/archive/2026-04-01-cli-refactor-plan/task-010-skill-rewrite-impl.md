# Task 010: Rewrite SKILL.md

**type**: impl
**depends-on**: ["009-main-entry-impl"]

## Goal

Rewrite `skills/brew-guide/SKILL.md` to guide AI agents to use CLI commands instead of OpenClaw tool calls. The skill should demonstrate the dry-run → confirm → write workflow.

## Files to Change

- `skills/brew-guide/SKILL.md` — full rewrite

## Steps

1. Update the SKILL.md frontmatter: keep name/description, remove any OpenClaw references
2. Update "Available Tables" section: describe the same tables but note they are accessed via CLI
3. Rewrite "Bean Entry Standard Workflow":
   - Step 1 (extract from image): unchanged
   - Step 2 (match roaster): change `[Call brew_guide_get_all_roasters]` → `brew-guide roasters --format json`
   - Step 3 (display info): unchanged
   - Step 4 (interactive loop): unchanged — agent still collects info interactively
   - **Add Step 5 (dry-run preview)**: before writing, run `brew-guide bean add ... --dry-run` and show output to user
   - **Add Step 6 (confirm & write)**: after user confirms, run `brew-guide bean add ...` (without `--dry-run`)
4. Update all code examples: replace `[Call brew_guide_upsert_bean with { ... }]` → `brew-guide bean add --name "..." --roaster "..." ...`
5. Update brewing notes workflow similarly: `brew-guide note add ...` with dry-run step
6. Update "Querying Records" section:
   - `brew-guide bean list [--limit N]`
   - `brew-guide note list [--limit N]`
7. **Remove** all delete-related sections (soft-delete, `brew_guide_delete_records`)
8. Update Anti-Patterns: replace tool references with CLI equivalents
9. Add a new "CLI Usage" section at the top explaining: "这些操作通过 `brew-guide` CLI 执行。确保已运行 `brew-guide init` 配置好 Supabase 凭证。"

## Verification

- `SKILL.md` contains no references to `brew_guide_upsert_bean`, `brew_guide_upsert_note`, `brew_guide_delete_records`, `brew_guide_list_recent`, `brew_guide_get_all_roasters`, or `openclaw`
- All examples use `brew-guide` CLI commands
- Dry-run workflow is present in both bean and note sections
- `brew-guide roasters` is used for roaster matching
