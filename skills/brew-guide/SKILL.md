---
name: brew-guide
description: Use when the user wants to manage coffee beans, brewing notes, equipment, brewing methods, or related brew-guide records through the brew-guide CLI, including adding beans from images, recording brewing parameters, managing equipment and recipes, matching roaster names, and querying recent entries.
---

# Brew Guide Skill

通过 `brew-guide` CLI 管理咖啡豆、冲煮记录、器具和冲煮方案。

前置条件：先 `brew-guide init` 配置 Supabase 凭证，或用 `BREW_GUIDE_*` 环境变量。

## Core Principle

**NEVER create incomplete records.** 先收集足够信息，再写入。

**字段口径**：产地 / 产区 / 庄园 / 处理站 / 处理法 / 品种怎么拆，见 `references/bean-add.md` 的「1.5 字段拆分口径」，不要凭直觉把一整串地名塞进 `--origin`。

> ⚠️ 当前 `bean add` 只有 `--origin / --estate / --process / --variety` 四个成分 flag，`region`、`processingStation`、`percentage` 还传不进去；遇到需要它们的豆子，先按口径想清楚，落地时再补齐（见 `bean-add.md` 拼配说明）。

## 渐进式披露（重要）

复杂操作的完整规则放在 `references/` 下。执行前按需读取，不要凭记忆。

| 要做的事 | 先读 |
|---|---|
| `bean add` 新增咖啡豆 | `references/bean-add.md` |
| `note add` 新增冲煮记录 | `references/note-add.md` |
| `method add` 新增冲煮方案 | `references/method-add.md` |
| 图片导入豆子时 OCR 失败 | `references/bean-image-import-fallback.md` |

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
| `bean add` | 新增（见 `references/bean-add.md`） | `brew-guide bean add --name "..." --roaster "..." --origin "..." --process "..." [--start-day 30] [--end-day 60] [options] [--dry-run]` |
| `bean list` | 列出 | `brew-guide bean list [--limit N] [--roast-level "浅度烘焙"] [--bean-type filter] [--has-remaining true] [--format json]` |
| `bean get` | 详情 | `brew-guide bean get <id> [--format json]` |
| `bean update` | 更新 | `brew-guide bean update <id> --remaining "..." [--origin "..."] [--process "..."] [--variety "..."] [--estate "..."] [--roast-date "YYYY-MM-DD"] [--start-day 30] [--end-day 60] [--dry-run]`（origin/process/variety/estate 合并进 blendComponents[0]）|
| `bean delete` | 软删除 | `brew-guide bean delete <id> [--dry-run]` |
| `bean consume` | 扣减余量 | `brew-guide bean consume <id> --amount 15 [--with-note] [--source quick-decrement] [--dry-run]` |

### note — 冲煮记录

| 子命令 | 用途 | 示例 |
|---|---|---|
| `note add` | 新增（见 `references/note-add.md`） | `brew-guide note add --bean-id "..." --method "..." [--equipment "V60"] [--rating 4] [--notes "..."] [--source tag] [--total-time 150] [--taste-body 4 --taste-acidity 4 --taste-sweetness 3 --taste-bitterness 2] [legacy flat flags] [--dry-run]` |
| `note list` | 列出 | `brew-guide note list [--limit N] [--equipment V60] [--method 日式] [--bean-id "..."] [--min-rating 3.5] [--format json]` |
| `note get` | 详情 | `brew-guide note get <id> [--format json]` |
| `note update` | 更新 | `brew-guide note update <id> --rating 4 --notes "..." [--equipment "V60"] [--total-time 150] [--source tag] [--ratio "1:15"] [--grind-size "..."] [--water-temp 92] [--coffee "15g"] [--water "225g"] [--taste-body 4] [--dry-run]`（`--rating` / `--taste-*` 0–5；taste / params 部分更新与现有值合并）|
| `note delete` | 软删除 | `brew-guide note delete <id> [--dry-run]` |

### equipment — 器具

| 子命令 | 用途 | 示例 |
|---|---|---|
| `equipment add` | 新增 | `brew-guide equipment add --name "V60" [--id "V60"] [--animation-type v60] [--has-valve] [--note "..."] [--dry-run]` |
| `equipment list` | 列出 | `brew-guide equipment list [--format json]` |
| `equipment get` | 详情 | `brew-guide equipment get <id> [--format json]` |
| `equipment update` | 更新 | `brew-guide equipment update <id> --name "..." --note "..." [--animation-type v60] [--has-valve true] [--dry-run]` |
| `equipment delete` | 软删除 | `brew-guide equipment delete <id> [--dry-run]` |

`--animation-type` 可选：`v60 / kalita / origami / clever / custom / espresso`，默认 `custom`。

### method — 冲煮方案

| 子命令 | 用途 | 示例 |
|---|---|---|
| `method add` | 新增（见 `references/method-add.md`） | `brew-guide method add --equipment-id "..." --name "..." [options] [--dry-run]` |
| `method list` | 列出 | `brew-guide method list [--equipment-id "..."] [--format json]` |
| `method get` | 详情 | `brew-guide method get <id> [--format json]` |
| `method update` | 更新名称/参数 | `brew-guide method update <id> [--name "..."] [--coffee "15g"] [--water "225g"] [--ratio "1:15"] [--grind-size "..."] [--temp "92°C"] [--dry-run]` |
| `method delete` | **硬删除** | `brew-guide method delete <id> [--dry-run]` |

### roasters — 查烘焙商

```bash
brew-guide roasters [--format json]
```

### 通用 flags

- `--dry-run`：预览即将执行的操作，不实际写入
- `--format json`：以 JSON 格式输出

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
