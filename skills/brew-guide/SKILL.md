---
name: brew-guide
description: Use when the user wants to manage coffee beans, brewing notes, equipment, brewing methods, or related brew-guide records through the brew-guide CLI, including adding beans from images, recording brewing parameters, managing equipment and recipes, matching roaster names, and querying recent entries.
---

# Brew Guide Skill

通过 `brew-guide` CLI 管理咖啡豆、冲煮记录、器具和冲煮方案。

前置条件：先 `brew-guide init` 配置 Supabase 凭证（**publishable / legacy anon key 就够，不要 service_role**——权限边界是表上的宽 RLS，不是这把 key），或用 `BREW_GUIDE_*` 环境变量。

## Core Principle

**NEVER create incomplete records.** 先收集足够信息，再写入。

**字段口径**：产地 / 产区 / 庄园 / 处理站 / 海拔 / 处理法 / 品种怎么拆，见 `references/bean-add.md` 的「1.5 字段拆分口径」，不要凭直觉把一整串地名塞进 `--origin`。

> 成分字段全都有 flag：`--origin --country --region --estate --processing-station --altitude --process --variety --batch --percentage`；拼配用可重复的 `--component "origin=…;region=…;process=…;percentage=33"`。详见 `bean-add.md` 拼配说明。

## 渐进式披露（重要）

复杂操作的完整规则放在 `references/` 下。执行前按需读取，不要凭记忆。

| 要做的事 | 先读 |
|---|---|
| `bean add` 新增咖啡豆 | `references/bean-add.md` |
| `note add` 新增冲煮记录 | `references/note-add.md` |
| `method add` 新增冲煮方案 | `references/method-add.md` |

其他命令（list / get / update / delete / consume / equipment add 等）规则简单，直接按下表使用即可。

## CLI 命令总览

### init

```bash
brew-guide init
```

交互式配置 Supabase 凭证。

### bean — 咖啡豆

| 子命令 | 用途 | 示例 |
|---|---|---|
| `bean add` | 新增（见 `references/bean-add.md`） | `brew-guide bean add --name "..." [--roaster "..."] [--origin "..."] [--process "..."] [--region ...] [--estate ...] [--processing-station ...] [--altitude ...] [--variety ...] [--batch ...] [--roast-level "浅度烘焙"] [--start-day 7] [--end-day 60] [--in-transit] [--is-frozen] [--bean-state green] [--purchase-date YYYY-MM-DD] [--price 88] [options] [--dry-run]`；**只有 `--name` 必填**（与 App 表单一致），其余留空即可；拼配加可重复的 `--component "origin=…;percentage=33"`（烘焙度不给就留空，不猜；`--start-day/--end-day` 不给时读 App 的赏味期设置：烘焙商配置 → 全局自定义 → 预设浅 7/60、中 10/60、深 14/90，且没有 `--roast-date` 时这组天数不生效；在途与冷冻互斥；生豆不能有 `--roast-date`） |
| `bean list` | 列出 | `brew-guide bean list [--limit N] [--roast-level "浅度烘焙"] [--bean-type filter] [--roaster "MAME"] [--region 古吉] [--process 日晒] [--variety 74158] [--country 埃塞俄比亚] [--batch "Lot 26"] [--has-remaining true] [--format json]`（产区/处理法/品种/产国/批次是包含匹配，`--region 古吉` 命中「古吉 罕贝拉」；产国字段空时 `--country` 回落到产地） |
| `bean get` | 详情 | `brew-guide bean get <id> [--format json]` |
| `bean update` | 更新 | `brew-guide bean update <id> --remaining "..." [--origin "..."] [--region "..."] [--processing-station "..."] [--altitude "..."] [--process "..."] [--variety "..."] [--estate "..."] [--batch "..."] [--percentage 33] [--component-index 2] [--component "origin=…;percentage=50"] [--roast-date "YYYY-MM-DD"] [--start-day 30] [--end-day 60] [--in-transit|--no-in-transit] [--is-frozen|--no-frozen] [--bean-state green|roasted] [--purchase-date YYYY-MM-DD] [--dry-run]`（成分字段合并进 `--component-index` 指定的成分，默认第 1 个；`--component` 整组替换；转生豆会清掉烘焙日期与赏味期）|
| `bean delete` | 软删除 | `brew-guide bean delete <id> [--dry-run]` |
| `bean consume` | 扣减余量 | `brew-guide bean consume <id> --amount 15 [--with-note] [--source quick-decrement] [--dry-run]`；请求量超过库存时余量归零并在 stderr 警告，`--with-note` 只记实际扣掉的量 |

### note — 冲煮记录

| 子命令 | 用途 | 示例 |
|---|---|---|
| `note add` | 新增（见 `references/note-add.md`） | `brew-guide note add --bean-id "..." --method "..." [--equipment "V60"] [--rating 4] [--notes "..."] [--source tag] [--total-time 150] [--water-temp 92] [--taste-body 4 --taste-acidity 4 --taste-sweetness 3 --taste-bitterness 2] [legacy flat flags] [--dry-run]`（`--bean-id` 和 `--equipment` 都会校验：豆子要在、器具要是内置 id 或 `equipment list` 里的 ID；`--rating` 只收 0–5；`--water-temp` 收 `92` 或 `92°C`，统一写 `92°C`；给 `--bean-id` 时会自动写一份 `coffeeBeanInfo` 豆子快照，和 App 一致） |
| `note list` | 列出 | `brew-guide note list [--limit N] [--equipment V60] [--method 日式] [--bean-id "..."] [--min-rating 3.5] [--from 2026-01-01] [--to 2026-12-31] [--format json]`（日期含当天，`--from` 晚于 `--to` 直接报错） |
| `note get` | 详情 | `brew-guide note get <id> [--format json]` |
| `note update` | 更新 | `brew-guide note update <id> --rating 4 --notes "..." [--equipment "V60"] [--total-time 150] [--source tag] [--ratio "1:15"] [--grind-size "..."] [--water-temp 92] [--coffee "15g"] [--water "225g"] [--taste-body 4] [--dry-run]`（`--rating` / `--taste-*` 0–5；taste / params 部分更新与现有值合并）|
| `note delete` | 软删除 | `brew-guide note delete <id> [--dry-run]` |

### equipment — 器具

| 子命令 | 用途 | 示例 |
|---|---|---|
| `equipment add` | 新增 | `brew-guide equipment add --name "V60" [--id "V60"] [--animation-type v60] [--has-valve] [--note "..."] [--force] [--dry-run]` |
| `equipment list` | 列出 | `brew-guide equipment list [--format json]` |
| `equipment get` | 详情 | `brew-guide equipment get <id> [--format json]` |
| `equipment update` | 更新 | `brew-guide equipment update <id> --name "..." --note "..." [--animation-type v60] [--has-valve true] [--dry-run]` |
| `equipment delete` | 软删除 | `brew-guide equipment delete <id> [--dry-run]` |

`--animation-type` 可选：`v60 / kalita / origami / clever / custom / espresso`，默认 `custom`。

`--id` 撞上已有器具时会报错并停下（不会静默覆盖）；确认要替换原器具才加 `--force`。

### method — 冲煮方案

| 子命令 | 用途 | 示例 |
|---|---|---|
| `method add` | 新增（见 `references/method-add.md`） | `brew-guide method add --equipment-id "..." --name "..." [--coffee 15g --water 225g --temp "92°C"] [--stages-json '[{"label":"闷蒸","water":"30g","duration":30,"detail":"注入 30g 水"}]'] [--dry-run]`（每个阶段必须有 `label` 和 `detail`；`--equipment-id` 要在） |
| `method list` | 列出 | `brew-guide method list [--equipment-id "..."] [--format json]` |
| `method get` | 详情 | `brew-guide method get <id> [--format json]` |
| `method update` | 更新名称/参数 | `brew-guide method update <id> [--name "..."] [--coffee "15g"] [--water "225g"] [--ratio "1:15"] [--grind-size "..."] [--temp "92°C"] [--dry-run]` |
| `method delete` | **硬删除** | `brew-guide method delete <id> [--dry-run]` |

### roasters — 查烘焙商

```bash
brew-guide roasters [--format json]
```

依赖库里的 `public.get_all_roasters()` 函数。项目里没建时命令会 **exit 1 并把建函数的 SQL 打到 stderr**，直接照抄进 Supabase SQL Editor 即可，不需要猜。

### backup — 整库备份

```bash
brew-guide backup [--out "D:\backups\brew.json"] [--include-deleted false] [--format json]
```

导出 `coffee_beans` / `brewing_notes` / `custom_equipments` / `custom_methods` / `user_settings` 的原始行。默认带软删行，默认文件名 `brew-guide-backup-<timestamp>.json`。**改库前先跑一次**。

### update-check — 查有没有新版本

```bash
brew-guide update-check [--format json]
```

输出 `{"current","latest","upgradable","source"}`。平时不用主动跑：每条命令会读本地缓存，发现 npm 上有新版本就在 stderr 提醒一次（24 小时最多刷一次缓存，同一版本只提醒一次，提示不等网络）。离线、超时、registry 异常都静默跳过。不想被提醒就设 `BREW_GUIDE_NO_UPDATE_CHECK=1`。

### 通用 flags

- `--dry-run`：预览即将执行的操作，不实际写入
- `--format json`：以 JSON 格式输出（stdout 单行紧凑；警告与错误走 stderr，可直接管道给 `jq`）。Windows 上输出被管道/重定向时，非 ASCII 字符会转成 `\uXXXX`（避免 GBK 控制台解码后破坏 JSON 结构），解析回来仍是原文，不用特殊处理。

退出码：`0` 成功 / `1` 运行时失败 / `2` 参数用法错误 / `64` 缺少或错误的配置 / `65` 网络请求失败。看到 `2` 先改参数，别重试。

优先用 `--dry-run` 展示，用户确认后再正式执行。

## 查询约定

在新增 bean 或 note 前，如果需要查重、补上下文、确认 ID，先查最近记录：

```bash
brew-guide bean list --format json --limit 20
brew-guide note list --format json --limit 20
brew-guide equipment list --format json
brew-guide method list --format json
brew-guide roasters --format json
```

## 删除操作注意

- `bean / note / equipment` 的 delete 为**软删除**
- `method` 的 delete 为**硬删除**
- 执行任何 delete 前务必先 `--dry-run` 确认目标 ID
