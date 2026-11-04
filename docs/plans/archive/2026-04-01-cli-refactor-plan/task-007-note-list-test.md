# Task 007: brew-guide note list — Tests

**type**: test
**depends-on**: ["001"]

## Goal

Write failing tests for `brew-guide note list`.

## BDD Scenarios

```gherkin
Feature: 列出冲煮记录

  Scenario: --format json 输出 JSON 数组
    Given Supabase 凭证通过环境变量配置
    When 我运行: brew-guide note list --format json
    Then 退出码为 0
    And stdout 为合法 JSON 数组

  Scenario: --limit 限制返回数量
    Given Supabase 凭证通过环境变量配置
    When 我运行: brew-guide note list --limit 3
    Then 退出码为 0
    And 返回记录不超过 3 条

  Scenario: --limit 非数字时报错
    When 我运行: brew-guide note list --limit abc
    Then 退出码非 0
    And stderr 含关于 --limit 的错误提示

  Scenario: 缺少配置时报错
    Given 无任何 Supabase 凭证
    When 我运行: brew-guide note list
    Then 退出码为 64
    And stderr 含 "Error: Config"
```

## Files to Create

- `tests/note-list.test.mjs`

## Steps

1. Create `tests/note-list.test.mjs` (mirrors `bean-list.test.mjs` structure, targeting `brewing_notes` table)
2. Same test pattern as `bean-list.test.mjs`

## Verification

- Tests **fail** (Red)
- No syntax errors
