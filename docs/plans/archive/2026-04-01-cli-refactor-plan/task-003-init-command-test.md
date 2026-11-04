# Task 003: brew-guide init — Tests

**type**: test
**depends-on**: ["001"]

## Goal

Write failing integration tests for the `brew-guide init` command.

## BDD Scenarios

```gherkin
Feature: 初始化配置

  Scenario: 成功初始化，创建安全权限配置文件
    Given ~/.config/brew-guide/ 不存在
    When brew-guide init 被调用（stdin 提供 URL、key、user-id）
    Then 退出码为 0
    And ~/.config/brew-guide/config.json 被创建
    And 文件权限为 600
    And stdout 含 "配置已保存至"

  Scenario: 用户 Ctrl+C 中断，不创建文件
    When brew-guide init 被调用
    And stdin 立即关闭（模拟 Ctrl+C）
    Then 退出码非 0
    And ~/.config/brew-guide/config.json 未创建

  Scenario: 已有配置文件时询问是否覆盖，用户确认
    Given ~/.config/brew-guide/config.json 已存在
    When brew-guide init 被调用（stdin 提供 "y" 覆盖确认）
    Then 旧配置被替换
    And 退出码为 0

  Scenario: 输入无效 URL 时重新提示（无效后输入有效）
    When brew-guide init 被调用
    And 第一次输入 URL "not-a-url"，第二次输入 "https://valid.supabase.co"
    Then 工具提示错误并重新要求输入
    And 最终退出码为 0
```

## Files to Create

- `tests/init.test.mjs` — integration tests using `node:child_process` `spawn`

## Steps

1. Create `tests/init.test.mjs`
2. Each test spawns `node src/main.ts init` (or `node dist/main.js init` after build) using `spawn` with controlled stdin pipe
3. Feed stdin lines one by one to simulate interactive input
4. Assert exit code, file creation, file permissions (`fs.stat().mode & 0o777`), stdout content
5. Clean up temp config files/directories in `after` hooks using a test-specific config path (set via env var override)

## Verification

- `npm test tests/init.test.mjs` runs but tests **fail** (Red — `src/commands/init.ts` doesn't exist yet)
- No syntax errors
