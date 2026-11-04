# Task 008: brew-guide roasters — Tests

**type**: test
**depends-on**: ["001"]

## Goal

Write failing tests for `brew-guide roasters`.

## BDD Scenarios

```gherkin
Feature: 列出所有烘焙商

  Scenario: --format json 输出字符串数组
    Given Supabase 凭证通过环境变量配置
    When 我运行: brew-guide roasters --format json
    Then 退出码为 0
    And stdout 为合法 JSON 字符串数组（Array<string>）

  Scenario: 默认列出所有去重烘焙商
    Given Supabase 凭证通过环境变量配置
    When 我运行: brew-guide roasters
    Then 退出码为 0
    And stdout 不为空（或含 "No roasters found"）

  Scenario: 缺少配置时报错
    Given 无任何 Supabase 凭证
    When 我运行: brew-guide roasters
    Then 退出码为 64
    And stderr 含 "Error: Config"
```

## Files to Create

- `tests/roasters.test.mjs`

## Steps

1. Create `tests/roasters.test.mjs`
2. **Format json test** (skip if no credentials): parse stdout as JSON; assert it's an array of strings
3. **Missing config test**: assert exit 64

## Verification

- Tests **fail** (Red)
- No syntax errors
