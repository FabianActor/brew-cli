# Task 002: Config Resolution — Tests

**type**: test
**depends-on**: ["001"]

## Goal

Write failing unit tests for the multi-source config resolution logic before implementing it.

## BDD Scenarios

```gherkin
Feature: 多源配置解析

  Scenario: 从环境变量读取（最高优先级）
    Given BREW_GUIDE_SUPABASE_URL 设为 "https://abc.supabase.co"
    And BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY 设为 "sbpk_xxx"
    And ~/.config/brew-guide/config.json 含不同值
    When resolveConfig() 被调用
    Then 返回环境变量中的 supabaseUrl 和 supabaseServiceRoleKey

  Scenario: 从 .env 文件读取（第二优先级）
    Given 环境变量未设置
    And cwd/.env 含 BREW_GUIDE_SUPABASE_URL 和 BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY
    When resolveConfig() 被调用
    Then 返回 .env 文件中的凭证

  Scenario: 从 config.json 读取（第三优先级）
    Given 环境变量和 .env 均未设置
    And ~/.config/brew-guide/config.json 含有效凭证
    When resolveConfig() 被调用
    Then 返回 config.json 中的凭证

  Scenario: 所有来源均无凭证时报错
    Given 所有凭证来源为空
    When resolveConfig() 被调用
    Then 抛出含 "Missing supabaseUrl" 的错误

  Scenario: config.json 权限过宽时发出警告
    Given ~/.config/brew-guide/config.json 权限为 644
    When resolveConfig() 被调用
    Then 成功返回配置
    And 在 stderr 输出 "Warning: config file has insecure permissions"
```

## Files to Create

- `tests/config.test.mjs` — unit tests for `resolveConfig()`

## Steps

1. Create `tests/config.test.mjs` using Node's built-in `node:test` and `assert` (consistent with existing test style)
2. For each scenario, write a test that:
   - Sets up the environment (mock env vars, temp files)
   - Calls `resolveConfig()` from `src/config.ts`
   - Asserts the returned config matches expectations, or that the correct error is thrown
3. For the "missing credentials" test: assert that the promise rejects with an error message containing "Missing"
4. For the "permissions warning" test: capture stderr output and assert it contains the warning string
5. Tests must clean up temp files/env vars in `after` hooks

## Verification

- `npm test tests/config.test.mjs` runs but all tests **fail** (Red phase — config.ts still uses OpenClaw's pluginConfig)
- Test file has no syntax errors (`npx tsc --noEmit` passes)
