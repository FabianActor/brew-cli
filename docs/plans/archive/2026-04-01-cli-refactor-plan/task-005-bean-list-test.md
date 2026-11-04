# Task 005: brew-guide bean list — Tests

**type**: test
**depends-on**: ["001"]

## Goal

Write failing tests for `brew-guide bean list`.

## BDD Scenarios

```gherkin
Feature: 列出咖啡豆记录

  Scenario: 默认列出最近豆子（集成，需真实 Supabase）
    Given Supabase 凭证通过环境变量配置
    When 我运行: brew-guide bean list
    Then 退出码为 0
    And stdout 不为空（或含 "No beans found"）

  Scenario: --format json 输出 JSON 数组
    Given Supabase 凭证通过环境变量配置
    When 我运行: brew-guide bean list --format json
    Then 退出码为 0
    And stdout 为合法 JSON 数组

  Scenario: --limit 限制返回数量
    Given Supabase 凭证通过环境变量配置
    When 我运行: brew-guide bean list --limit 5
    Then 退出码为 0
    And 返回记录不超过 5 条

  Scenario: --limit 非数字时报错
    When 我运行: brew-guide bean list --limit abc
    Then 退出码非 0
    And stderr 含关于 --limit 的错误提示

  Scenario: 缺少配置时报错
    Given 无任何 Supabase 凭证
    When 我运行: brew-guide bean list
    Then 退出码为 64
    And stderr 含 "Error: Config"
```

## Files to Create

- `tests/bean-list.test.mjs`

## Steps

1. Create `tests/bean-list.test.mjs` using `execSync`/`spawnSync`
2. **Integration tests** (skip if `BREW_GUIDE_SUPABASE_URL` not set): call with real credentials
3. **--format json test**: parse stdout as JSON array, assert `Array.isArray(result) === true`
4. **--limit non-number test**: no credentials needed; assert non-zero exit
5. **Missing config test**: run without any env vars; assert exit code 64

## Verification

- `npm test tests/bean-list.test.mjs` — tests **fail** (Red)
- No syntax errors
