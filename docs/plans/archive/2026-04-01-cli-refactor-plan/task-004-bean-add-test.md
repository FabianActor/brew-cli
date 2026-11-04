# Task 004: brew-guide bean add — Tests

**type**: test
**depends-on**: ["001"]

## Goal

Write failing tests for `brew-guide bean add`, focusing on dry-run behavior (no Supabase needed) and argument validation.

## BDD Scenarios

```gherkin
Feature: 新增咖啡豆

  Scenario: --dry-run 打印数据不写入 Supabase
    When 我运行:
      brew-guide bean add --name "X" --roaster "R" --origin "O" --process "P" --dry-run
    Then 退出码为 0
    And stdout 含 "[dry-run]"
    And stdout 含将要写入的 JSON 数据（包含 name, roaster, origin, process）
    And 未发起任何 Supabase 请求

  Scenario: --dry-run --format json 输出结构化预览
    When 我运行:
      brew-guide bean add --name "X" --roaster "R" --origin "O" --process "P" --dry-run --format json
    Then 退出码为 0
    And stdout 为合法 JSON: { "dryRun": true, "bean": { "name": "X", ... } }

  Scenario: --dry-run 在网络不可用时仍然成功
    Given 无任何 Supabase 凭证配置
    When 我运行:
      brew-guide bean add --name "X" --roaster "R" --origin "O" --process "P" --dry-run
    Then 退出码为 0
    And stdout 含 "[dry-run]"

  Scenario: 缺少必填参数时报错
    When 我运行: brew-guide bean add --name "Ethiopia" --roaster "R"
    Then 退出码非 0
    And stderr 或 stdout 含必填参数提示信息

  Scenario: 仅必填参数新增豆子（集成，需真实 Supabase）
    Given Supabase 凭证通过环境变量配置
    When 我运行:
      brew-guide bean add --name "Test Bean" --roaster "Test" --origin "Test" --process "washed"
    Then 退出码为 0
    And stdout 含 "Created bean bean_"

  Scenario: 带所有可选参数新增豆子（集成，需真实 Supabase）
    Given Supabase 凭证通过环境变量配置
    When 我运行:
      brew-guide bean add --name "Kenya AA" --roaster "Specialty Co" --origin "Kenya"
        --process "natural" --variety "Bourbon" --roast-level "medium" --flavor "蓝莓,巧克力"
    Then 退出码为 0
    And stdout 含 "Created bean bean_"

  Scenario: 数据超过 64KB 报错（集成，需真实 Supabase）
    Given Supabase 凭证通过环境变量配置
    When notes 字段超过 64KB
    Then 退出码为 1
    And stderr 含 "64 KB" 或类似大小限制提示
```

## Files to Create

- `tests/bean-add.test.mjs` — tests using `execSync`/`spawn`

## Steps

1. Create `tests/bean-add.test.mjs`
2. **Dry-run tests** (no credentials needed): use `execSync` without Supabase env vars; assert exit code 0 and stdout content
3. **Format json dry-run test**: parse stdout as JSON, assert `result.dryRun === true` and `result.bean.name === 'X'`
4. **Missing args test**: run with only `--name` and `--roaster`, assert non-zero exit code
5. **Integration test** (skip if `BREW_GUIDE_SUPABASE_URL` not set): call with all required args, assert stdout contains `"Created bean bean_"`

## Verification

- Dry-run tests: **fail** (Red — command doesn't exist yet)
- No syntax errors
