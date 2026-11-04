# Task 006: brew-guide note add — Tests

**type**: test
**depends-on**: ["001"]

## Goal

Write failing tests for `brew-guide note add`, focusing on dry-run and argument validation.

## BDD Scenarios

```gherkin
Feature: 新增冲煮记录

  Scenario: --dry-run 打印数据不写入 Supabase
    When 我运行:
      brew-guide note add --bean-id "bean_123" --method "V60" --score 85 --dry-run
    Then 退出码为 0
    And stdout 含 "[dry-run]"
    And stdout 含将要写入的 JSON 数据

  Scenario: --dry-run --format json 输出结构化预览
    When 我运行:
      brew-guide note add --bean-id "bean_123" --method "V60" --dry-run --format json
    Then 退出码为 0
    And stdout 为合法 JSON: { "dryRun": true, "note": { "beanId": "bean_123", "method": "V60" } }

  Scenario: --dry-run 在无凭证时仍然成功
    Given 无任何 Supabase 凭证配置
    When 我运行:
      brew-guide note add --bean-id "bean_123" --method "V60" --dry-run
    Then 退出码为 0

  Scenario: 缺少必填参数 --method
    When 我运行: brew-guide note add --bean-id "bean_123"
    Then 退出码非 0
    And 错误提示中含 "method"

  Scenario: 仅必填参数新增记录（集成，需真实 Supabase）
    Given Supabase 凭证通过环境变量配置
    When 我运行:
      brew-guide note add --bean-id "bean_test" --method "V60"
    Then 退出码为 0
    And stdout 含 "Created note note_"

  Scenario: 带所有参数新增记录（集成，需真实 Supabase）
    Given Supabase 凭证通过环境变量配置
    When 我运行:
      brew-guide note add --bean-id "bean_test" --method "Espresso"
        --grind-size "8.5" --water-temp 92 --ratio "1:2.5" --score 87
    Then 退出码为 0
    And stdout 含 "Created note note_"

  Scenario: 数据超过 64KB 报错（集成，需真实 Supabase）
    Given Supabase 凭证通过环境变量配置
    When memo 字段超过 64KB
    Then 退出码为 1
    And stderr 含 "64 KB" 或类似大小限制提示
```

## Files to Create

- `tests/note-add.test.mjs`

## Steps

1. Create `tests/note-add.test.mjs` using `execSync`/`spawnSync`
2. **Dry-run tests**: no credentials needed; assert exit 0 and stdout content
3. **Format json dry-run**: parse stdout as JSON, assert `result.dryRun === true`, `result.note.beanId === 'bean_123'`
4. **Missing args test**: run without `--method`; assert non-zero exit
5. **Integration test** (skip if env var not set)

## Verification

- Tests **fail** (Red)
- No syntax errors
