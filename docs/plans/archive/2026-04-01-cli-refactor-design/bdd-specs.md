# BDD 规格说明

## 功能一：配置解析

```gherkin
Feature: 多源配置解析
  As a CLI 用户
  I want CLI 从多个来源读取凭证
  So that 我可以灵活管理 Supabase 配置

  Background:
    Given 环境变量 BREW_GUIDE_* 未设置
    And cwd 下无 .env 文件
    And ~/.config/brew-guide/config.json 可能存在也可能不存在

  Scenario: 从环境变量读取（最高优先级）
    Given BREW_GUIDE_SUPABASE_URL 设为 "https://abc.supabase.co"
    And BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY 设为 "sbpk_xxx"
    And ~/.config/brew-guide/config.json 含不同值
    When 我运行: brew-guide bean list
    Then 退出码为 0
    And 使用环境变量中的凭证连接

  Scenario: 从 .env 文件读取（第二优先级）
    Given 环境变量未设置
    And cwd/.env 内含:
      """
      BREW_GUIDE_SUPABASE_URL=https://xyz.supabase.co
      BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY=sbpk_local
      """
    And ~/.config/brew-guide/config.json 含不同值
    When 我运行: brew-guide bean list
    Then 退出码为 0
    And 使用 .env 文件中的凭证

  Scenario: 从 config.json 读取（第三优先级）
    Given 环境变量和 .env 均未设置
    And ~/.config/brew-guide/config.json 含有效凭证
    When 我运行: brew-guide bean list
    Then 退出码为 0
    And 使用 config.json 中的凭证

  Scenario: 所有来源均无凭证时报错
    Given 所有凭证来源为空
    When 我运行: brew-guide bean list
    Then 退出码为 64
    And stderr 含 "Error: Config - Missing Supabase credentials"
    And stderr 提示运行 brew-guide init

  Scenario: config.json 权限过宽时发出警告
    Given ~/.config/brew-guide/config.json 权限为 644
    When 我运行: brew-guide bean list
    Then 退出码为 0
    And stderr 含 "Warning: config file has insecure permissions"
    And 命令正常执行（警告不阻断）
```

---

## 功能二：brew-guide init

```gherkin
Feature: 初始化配置
  As a 新用户
  I want 通过交互向导配置凭证
  So that 我不需要手动编辑配置文件

  Scenario: 成功初始化，创建安全权限配置文件
    Given ~/.config/brew-guide/ 不存在
    When 我运行: brew-guide init
    And 输入 Supabase URL: "https://abc.supabase.co"
    And 输入 Service Role Key: "sbpk_xxx"
    And 输入 User ID（回车跳过）
    Then 退出码为 0
    And ~/.config/brew-guide/config.json 被创建
    And 文件权限为 600
    And stdout 含 "配置已保存至"

  Scenario: 用户 Ctrl+C 中断，不创建文件
    When 我运行: brew-guide init
    And 在输入 URL 时按 Ctrl+C
    Then 退出码为 130
    And ~/.config/brew-guide/config.json 未创建

  Scenario: 已有配置文件时询问是否覆盖
    Given ~/.config/brew-guide/config.json 已存在
    When 我运行: brew-guide init
    And 工具询问 "已有配置，是否覆盖？(y/n)"
    And 我输入 "y"
    Then 旧配置被替换
    And 退出码为 0

  Scenario: 输入无效 URL 时重新提示
    When 我运行: brew-guide init
    And 我输入 URL "not-a-url"
    Then 工具拒绝并重新提示输入合法 URL
```

---

## 功能三：brew-guide bean add

```gherkin
Feature: 新增咖啡豆
  As a 咖啡爱好者
  I want 通过 CLI 记录咖啡豆信息
  So that 我可以跟踪豆子收藏

  Background:
    Given Supabase 凭证已正确配置
    And 网络连接可用

  Scenario: 仅必填参数新增豆子
    When 我运行:
      """
      brew-guide bean add --name "Ethiopia Yirgacheffe" --roaster "Local" --origin "Ethiopia" --process "washed"
      """
    Then 退出码为 0
    And stdout 含 "Created bean bean_"
    And Supabase 中存在该记录

  Scenario: 带所有可选参数新增豆子
    When 我运行:
      """
      brew-guide bean add \
        --name "Kenya AA" \
        --roaster "Specialty Co" \
        --origin "Kenya" \
        --process "natural" \
        --variety "Bourbon" \
        --roast-level "medium" \
        --roast-date "2026-03-15" \
        --price "18" \
        --capacity "340g" \
        --bean-type "filter" \
        --flavor "蓝莓,巧克力"
      """
    Then 退出码为 0
    And 所有字段持久化到 Supabase
    And flavor 字段为数组 ["蓝莓", "巧克力"]

  Scenario: --dry-run 打印数据不写入 Supabase
    When 我运行:
      """
      brew-guide bean add --name "X" --roaster "R" --origin "O" --process "P" --dry-run
      """
    Then 退出码为 0
    And stdout 含 "[dry-run]"
    And stdout 含将要写入的 JSON 数据
    And Supabase 中不存在任何新记录

  Scenario: --dry-run --format json 输出结构化预览
    When 我运行:
      """
      brew-guide bean add --name "X" --roaster "R" --origin "O" --process "P" --dry-run --format json
      """
    Then 退出码为 0
    And stdout 为合法 JSON:
      """json
      { "dryRun": true, "bean": { "name": "X", "roaster": "R", "origin": "O", "process": "P" } }
      """

  Scenario: 缺少必填参数时报错
    When 我运行: brew-guide bean add --name "Ethiopia" --roaster "R"
    Then 退出码为 2
    And stderr 含 "Missing required arguments: --origin, --process"

  Scenario: --format json 输出结构化结果
    When 我运行:
      """
      brew-guide bean add --name "X" --roaster "X" --origin "X" --process "X" --format json
      """
    Then 退出码为 0
    And stdout 为合法 JSON:
      """json
      { "id": "bean_...", "status": "created", "timestamp": "..." }
      """

  Scenario: 数据超过 64KB 报错
    When notes 字段超过 64KB
    Then 退出码为 1
    And stderr 含 "Error: Bean data exceeds 64 KB limit"

  Scenario: 网络不可用时报网络错误（dry-run 不受影响）
    Given 网络连接已断开
    When 我运行 brew-guide bean add --name "X" --roaster "X" --origin "X" --process "X"
    Then 退出码为 65
    And stderr 含 "Error: Network"

  Scenario: --dry-run 在网络不可用时仍然成功
    Given 网络连接已断开
    When 我运行 brew-guide bean add --name "X" --roaster "X" --origin "X" --process "X" --dry-run
    Then 退出码为 0
    And stdout 含 "[dry-run]"
```

---

## 功能四：brew-guide bean list

```gherkin
Feature: 列出咖啡豆记录

  Background:
    Given Supabase 凭证已配置
    And 已存在多条豆子记录

  Scenario: 默认列出最近豆子
    When 我运行: brew-guide bean list
    Then 退出码为 0
    And 显示最多 20 条记录（默认值）
    And 按 updated_at 降序排列

  Scenario: --limit 限制返回数量
    When 我运行: brew-guide bean list --limit 5
    Then 退出码为 0
    And 最多显示 5 条记录

  Scenario: --format json 输出 JSON 数组
    When 我运行: brew-guide bean list --format json
    Then stdout 为合法 JSON 数组，每项含 id、name、roaster、updatedAt

  Scenario: 无记录时显示友好提示
    Given 该用户无任何豆子记录
    When 我运行: brew-guide bean list
    Then 退出码为 0
    And stdout 含 "No beans found"

  Scenario: 网络错误
    Given 网络不可用
    When 我运行: brew-guide bean list
    Then 退出码为 65
    And stderr 含 "Error: Network"

  Scenario: --limit 非数字时报错
    When 我运行: brew-guide bean list --limit abc
    Then 退出码为 2
    And stderr 含 "--limit must be a positive integer"
```

---

## 功能五：brew-guide note add

```gherkin
Feature: 新增冲煮记录

  Scenario: 仅必填参数新增记录
    When 我运行: brew-guide note add --bean-id "bean_123" --method "V60"
    Then 退出码为 0
    And stdout 含 "Created note note_"

  Scenario: 带所有参数新增记录
    When 我运行:
      """
      brew-guide note add \
        --bean-id "bean_123" \
        --method "Espresso" \
        --grind-size "8.5" \
        --water-temp 92 \
        --ratio "1:2.5" \
        --brew-time "27s" \
        --flavor "巧克力" \
        --score 87 \
        --memo "调试 +0.5g"
      """
    Then 退出码为 0
    And 所有字段持久化

  Scenario: --dry-run 打印数据不写入 Supabase
    When 我运行:
      """
      brew-guide note add --bean-id "bean_123" --method "V60" --score 85 --dry-run
      """
    Then 退出码为 0
    And stdout 含 "[dry-run]"
    And stdout 含将要写入的 JSON 数据
    And Supabase 中不存在任何新记录

  Scenario: --dry-run --format json 输出结构化预览
    When 我运行:
      """
      brew-guide note add --bean-id "bean_123" --method "V60" --dry-run --format json
      """
    Then 退出码为 0
    And stdout 为合法 JSON:
      """json
      { "dryRun": true, "note": { "beanId": "bean_123", "method": "V60" } }
      """

  Scenario: 缺少必填参数
    When 我运行: brew-guide note add --bean-id "bean_123"
    Then 退出码为 2
    And stderr 含 "Missing required arguments: --method"

  Scenario: --format json 输出
    When 我运行: brew-guide note add --bean-id "b" --method "V60" --format json
    Then stdout 为合法 JSON 含 id, beanId, method, status

  Scenario: 网络不可用时报网络错误
    Given 网络连接已断开
    When 我运行 brew-guide note add --bean-id "b" --method "V60"
    Then 退出码为 65
    And stderr 含 "Error: Network"

  Scenario: --dry-run 在网络不可用时仍然成功
    Given 网络连接已断开
    When 我运行 brew-guide note add --bean-id "b" --method "V60" --dry-run
    Then 退出码为 0
    And stdout 含 "[dry-run]"

  Scenario: 数据超过 64KB 报错
    When memo 字段超过 64KB
    Then 退出码为 1
    And stderr 含 "Error: Note data exceeds 64 KB limit"
```

---

## 功能六：brew-guide note list

```gherkin
Feature: 列出冲煮记录

  Background:
    Given Supabase 凭证已配置
    And 已存在多条冲煮记录

  Scenario: 默认列出最近冲煮记录
    When 我运行: brew-guide note list
    Then 退出码为 0
    And 显示最多 20 条记录（默认值）
    And 按 updated_at 降序排列

  Scenario: --limit 限制返回数量
    When 我运行: brew-guide note list --limit 5
    Then 退出码为 0
    And 最多显示 5 条记录

  Scenario: --format json 输出 JSON 数组
    When 我运行: brew-guide note list --format json
    Then stdout 为合法 JSON 数组，每项含 id、beanId、method、score、updatedAt

  Scenario: 无记录时显示友好提示
    Given 该用户无任何冲煮记录
    When 我运行: brew-guide note list
    Then 退出码为 0
    And stdout 含 "No notes found"

  Scenario: 网络错误
    Given 网络不可用
    When 我运行: brew-guide note list
    Then 退出码为 65
    And stderr 含 "Error: Network"

  Scenario: --limit 非数字时报错
    When 我运行: brew-guide note list --limit abc
    Then 退出码为 2
    And stderr 含 "--limit must be a positive integer"
```

---

## 功能七：brew-guide roasters

```gherkin
Feature: 列出所有烘焙商

  Scenario: 列出所有去重烘焙商
    When 我运行: brew-guide roasters
    Then 退出码为 0
    And stdout 每行一个烘焙商名称
    And 无重复

  Scenario: --format json 输出字符串数组
    When 我运行: brew-guide roasters --format json
    Then stdout 为合法 JSON 字符串数组

  Scenario: 无烘焙商数据
    Given 无任何豆子记录含 roaster 字段
    When 我运行: brew-guide roasters
    Then 退出码为 0
    And stdout 含 "No roasters found"

  Scenario: 网络错误
    Given 网络不可用
    When 我运行: brew-guide roasters
    Then 退出码为 65
    And stderr 含 "Error: Network"
```

---

## 功能八：错误与帮助

```gherkin
Feature: 帮助与版本信息

  Scenario: 主命令帮助
    When 我运行: brew-guide --help
    Then 退出码为 0
    And stdout 显示所有子命令列表

  Scenario: 子命令帮助
    When 我运行: brew-guide bean add --help
    Then 退出码为 0
    And stdout 显示所有参数说明

  Scenario: 版本号
    When 我运行: brew-guide --version
    Then 退出码为 0
    And stdout 含版本号

  Scenario: 未知命令
    When 我运行: brew-guide unknown-cmd
    Then 退出码为 2
    And stderr 含 "Unknown command"
    And stderr 建议运行 --help

  Scenario: Ctrl+C 中断操作
    When 操作进行中按 Ctrl+C
    Then 退出码为 130
    And 无半写入的数据
```
