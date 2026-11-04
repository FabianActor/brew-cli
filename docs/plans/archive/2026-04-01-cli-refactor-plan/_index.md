# CLI 重构实现计划

**日期**: 2026-04-01
**设计来源**: `docs/plans/2026-04-01-cli-refactor-design/`
**目标**: 将 OpenClaw Plugin 重构为基于 Citty 的独立 CLI

---

## 概述

将现有 OpenClaw plugin 改造为独立 CLI 工具 `brew-guide`。核心操作：

- **新增**：`bean add`、`note add`（含 `--dry-run`）
- **查询**：`bean list`、`note list`、`roasters`
- **初始化**：`init`（引导配置 Supabase 凭证）

`src/tools/` 中的 execute 函数全部复用，只新增命令层和配置层。

---

## Execution Plan

```yaml
tasks:
  - id: "001"
    subject: "Project setup: remove OpenClaw, add Citty/c12/tsup"
    slug: "project-setup"
    type: "setup"
    depends-on: []

  - id: "002-test"
    subject: "Config resolution tests (multi-source priority)"
    slug: "config-test"
    type: "test"
    depends-on: ["001"]

  - id: "002-impl"
    subject: "Config resolution implementation (c12)"
    slug: "config-impl"
    type: "impl"
    depends-on: ["002-test"]

  - id: "003-test"
    subject: "brew-guide init command tests"
    slug: "init-command-test"
    type: "test"
    depends-on: ["001"]

  - id: "003-impl"
    subject: "brew-guide init command implementation"
    slug: "init-command-impl"
    type: "impl"
    depends-on: ["003-test"]

  - id: "004-test"
    subject: "brew-guide bean add tests (dry-run focus)"
    slug: "bean-add-test"
    type: "test"
    depends-on: ["001"]

  - id: "004-impl"
    subject: "brew-guide bean add implementation"
    slug: "bean-add-impl"
    type: "impl"
    depends-on: ["004-test", "002-impl"]

  - id: "005-test"
    subject: "brew-guide bean list tests"
    slug: "bean-list-test"
    type: "test"
    depends-on: ["001"]

  - id: "005-impl"
    subject: "brew-guide bean list implementation"
    slug: "bean-list-impl"
    type: "impl"
    depends-on: ["005-test", "002-impl"]

  - id: "006-test"
    subject: "brew-guide note add tests (dry-run focus)"
    slug: "note-add-test"
    type: "test"
    depends-on: ["001"]

  - id: "006-impl"
    subject: "brew-guide note add implementation"
    slug: "note-add-impl"
    type: "impl"
    depends-on: ["006-test", "002-impl"]

  - id: "007-test"
    subject: "brew-guide note list tests"
    slug: "note-list-test"
    type: "test"
    depends-on: ["001"]

  - id: "007-impl"
    subject: "brew-guide note list implementation"
    slug: "note-list-impl"
    type: "impl"
    depends-on: ["007-test", "002-impl"]

  - id: "008-test"
    subject: "brew-guide roasters tests"
    slug: "roasters-test"
    type: "test"
    depends-on: ["001"]

  - id: "008-impl"
    subject: "brew-guide roasters implementation"
    slug: "roasters-impl"
    type: "impl"
    depends-on: ["008-test", "002-impl"]

  - id: "009"
    subject: "Main entry point: wire all commands + build"
    slug: "main-entry-impl"
    type: "impl"
    depends-on: ["003-impl", "004-impl", "005-impl", "006-impl", "007-impl", "008-impl"]

  - id: "010"
    subject: "Rewrite SKILL.md for CLI"
    slug: "skill-rewrite-impl"
    type: "impl"
    depends-on: ["009"]
```

---

## Task File References

- [Task 001: Project Setup](./task-001-project-setup.md)
- [Task 002-test: Config Resolution Tests](./task-002-config-test.md)
- [Task 002-impl: Config Resolution Implementation](./task-002-config-impl.md)
- [Task 003-test: init Command Tests](./task-003-init-command-test.md)
- [Task 003-impl: init Command Implementation](./task-003-init-command-impl.md)
- [Task 004-test: bean add Tests](./task-004-bean-add-test.md)
- [Task 004-impl: bean add Implementation](./task-004-bean-add-impl.md)
- [Task 005-test: bean list Tests](./task-005-bean-list-test.md)
- [Task 005-impl: bean list Implementation](./task-005-bean-list-impl.md)
- [Task 006-test: note add Tests](./task-006-note-add-test.md)
- [Task 006-impl: note add Implementation](./task-006-note-add-impl.md)
- [Task 007-test: note list Tests](./task-007-note-list-test.md)
- [Task 007-impl: note list Implementation](./task-007-note-list-impl.md)
- [Task 008-test: roasters Tests](./task-008-roasters-test.md)
- [Task 008-impl: roasters Implementation](./task-008-roasters-impl.md)
- [Task 009: Main Entry Point](./task-009-main-entry-impl.md)
- [Task 010: Skill Rewrite](./task-010-skill-rewrite-impl.md)

---

## BDD Coverage

| BDD 功能 | 场景 | 对应任务 |
|---|---|---|
| 功能一：配置解析 | 环境变量优先、.env 次之、config.json 第三、无凭证报错、权限警告 | 002-test + 002-impl |
| 功能二：init | 成功初始化 600 权限、Ctrl+C 中断、覆盖确认、无效 URL 重提示 | 003-test + 003-impl |
| 功能三：bean add | 必填参数、可选参数、dry-run、dry-run+json、缺参报错、json 输出、64KB 限制、网络错误、dry-run 离线 | 004-test + 004-impl |
| 功能四：bean list | 默认列出、--limit、--format json、无记录、网络错误、--limit 无效 | 005-test + 005-impl |
| 功能五：note add | 必填参数、全参数、dry-run、dry-run+json、缺参报错、json 输出、网络错误、dry-run 离线、64KB 限制 | 006-test + 006-impl |
| 功能六：note list | 默认列出、--limit、--format json、无记录、网络错误、--limit 无效 | 007-test + 007-impl |
| 功能七：roasters | 去重列出、--format json、无数据、网络错误 | 008-test + 008-impl |
| 功能八：帮助与版本 | --help、bean add --help、--version、未知命令、Ctrl+C | 009 (Citty 内置) |

---

## Dependency Chain

```
001 (setup)
├── 002-test ──► 002-impl ──────────────────────┐
├── 003-test ──► 003-impl ────────────────────── │
├── 004-test ──► 004-impl (needs 002-impl) ──── │
├── 005-test ──► 005-impl (needs 002-impl) ──── ├──► 009 (main + build) ──► 010 (skill)
├── 006-test ──► 006-impl (needs 002-impl) ──── │
├── 007-test ──► 007-impl (needs 002-impl) ──── │
└── 008-test ──► 008-impl (needs 002-impl) ──────┘
```

**并行机会**：001 完成后，002～008 的所有 test 任务可并行写入。所有 impl 任务也可以并行执行（各自只依赖自己的 test 任务和 002-impl）。

---

## 关键约束

- `src/tools/*.ts` 和 `src/lib/*.ts` **不修改**，只复用
- `--dry-run` 必须在不调用 `resolveConfig()` 的情况下完成（离线可用）
- 集成测试中凡需要 Supabase 的场景，在 `BREW_GUIDE_SUPABASE_URL` 未设置时跳过（`test.skip`）
