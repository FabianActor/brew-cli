# CLI 重构设计：OpenClaw Plugin → 独立 CLI

**日期**: 2026-04-01
**当前版本**: 0.1.4 (OpenClaw Plugin)
**目标**: 基于 Citty 的独立 CLI，通过 skill 驱动操作

---

## 背景与动机

当前项目以 OpenClaw Plugin 形式存在，依赖 OpenClaw gateway 才能运行。重构为独立 CLI 后：

- 无需 OpenClaw 依赖，任意 AI agent 均可通过 shell 命令驱动
- 安装更简单：`npm install -g brew-guide-cli`
- Skill 通过拼接 shell 命令操作数据，而非调用注册工具

---

## 需求汇总

| 维度 | 决策 |
|---|---|
| CLI 框架 | **Citty** (UnJS 生态) |
| CLI 风格 | 子命令：`brew-guide bean add`、`brew-guide note add` |
| 配置来源 | env var > `.env` > `~/.config/brew-guide/config.json` |
| 发布方式 | 单一 npm 包，包含 CLI binary + skills 目录 |
| 向后兼容 | 完全替换，不保留 OpenClaw plugin |
| 操作范围 | **仅新增和查询**，不支持更新（无 `--id` 覆盖）和删除 |
| Dry Run | 所有写入命令支持 `--dry-run`，仅打印将要写入的数据，不执行 Supabase 操作 |

---

## 架构概述

### 数据流对比

```
Before: OpenClaw API → plugin config → tools → Supabase
After:  CLI flags/env → config resolution → commands → logic → Supabase
```

### 命令树

```
brew-guide
├── init                     # 引导配置，写 ~/.config/brew-guide/config.json
├── bean
│   ├── add [--dry-run]      # 新增咖啡豆（--name --roaster --origin --process ...）
│   └── list                 # 列出最近咖啡豆（--limit）
├── note
│   ├── add [--dry-run]      # 新增冲煮记录（--bean-id --method ...）
│   └── list                 # 列出最近冲煮记录（--limit）
└── roasters                 # 列出所有去重烘焙商
```

**已移除**：`bean delete`、`note delete`、更新模式（`--id` 覆盖）、`--include-deleted`

### Skill 调用示例

```bash
# Skill 引导 agent 执行：

# 1. 先 dry-run 预览数据
brew-guide bean add \
  --name '秘鲁 美景庄园 SL-09 水洗' \
  --roaster 'Finish Line Coffee' \
  --origin '秘鲁' \
  --process '水洗' \
  --variety 'SL-09' \
  --roast-level '浅度烘焙' \
  --flavor '清晰花香,橙子,柑橘酸质' \
  --dry-run

# 2. 确认无误后正式写入
brew-guide bean add \
  --name '秘鲁 美景庄园 SL-09 水洗' \
  --roaster 'Finish Line Coffee' \
  --origin '秘鲁' \
  --process '水洗' \
  --variety 'SL-09' \
  --roast-level '浅度烘焙' \
  --flavor '清晰花香,橙子,柑橘酸质'

brew-guide note add \
  --bean-id 'bean_abc123' \
  --method 'V60' \
  --grind-size 'Comandante 24 clicks' \
  --water-temp 92 \
  --ratio '1:15' \
  --score 85

brew-guide roasters   # 用于烘焙商名称匹配
brew-guide bean list  # 查询已有记录
```

---

## 项目结构（目标）

```
brew-guide-cli/
├── src/
│   ├── main.ts                    # Citty runMain() 入口
│   ├── config.ts                  # c12 多源配置解析（重写）
│   ├── client.ts                  # Supabase 客户端（不变）
│   ├── commands/
│   │   ├── bean/
│   │   │   ├── index.ts           # bean 命令组
│   │   │   ├── add.ts             # 新增（含 --dry-run）
│   │   │   └── list.ts
│   │   ├── note/
│   │   │   ├── index.ts
│   │   │   ├── add.ts             # 新增（含 --dry-run）
│   │   │   └── list.ts
│   │   ├── roasters.ts
│   │   └── init.ts
│   ├── tools/                     # 部分复用
│   │   ├── upsertBean.ts          # ✅ 复用（仅新增路径）
│   │   ├── upsertNote.ts          # ✅ 复用（仅新增路径）
│   │   ├── listRecent.ts          # ✅ 复用
│   │   ├── getAllRoasters.ts      # ✅ 复用
│   │   └── deleteRecords.ts       # ❌ 不使用
│   ├── lib/                       # ✅ 全部复用，无需修改
│   │   ├── ids.ts
│   │   ├── timestamps.ts
│   │   └── tables.ts
│   └── types/
│       └── coffeeBean.ts          # ✅ 复用
├── skills/
│   └── brew-guide/
│       └── SKILL.md               # 重写，改为驱动 CLI 命令
├── package.json                   # 重大变更（见架构文档）
└── tsup.config.ts                 # 新增构建配置
```

### 可复用 vs 需修改

| 文件 | 状态 | 说明 |
|---|---|---|
| `src/tools/*.ts` | ✅ 完全复用 | execute 函数无 OpenClaw 耦合 |
| `src/lib/*.ts` | ✅ 完全复用 | 纯函数，零框架依赖 |
| `src/client.ts` | ✅ 完全复用 | 接受 config 参数 |
| `src/types/` | ✅ 完全复用 | 纯类型定义 |
| `src/config.ts` | 🔄 重写 | 从 OpenClaw pluginConfig → c12 多源 |
| `index.ts` | ❌ 删除 | OpenClaw plugin 入口 |
| `openclaw.plugin.json` | ❌ 删除 | Plugin manifest |
| `src/lib/toolResults.ts` | ❌ 删除 | CLI 直接 console.log |

---

## 配置解析逻辑

```typescript
// 优先级：env var > .env（c12 dotenv） > ~/.config/brew-guide/config.json（c12 globalRc）
import { loadConfig } from 'c12'

export async function resolveConfig(): Promise<BrewGuideConfig> {
  const { config } = await loadConfig<BrewGuideConfig>({
    name: 'brew-guide',
    globalRc: true,
    dotenv: true,
    defaults: { brewGuideUserId: 'default_user' },
  })

  const supabaseUrl = process.env.BREW_GUIDE_SUPABASE_URL ?? config.supabaseUrl
  const supabaseServiceRoleKey = process.env.BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY ?? config.supabaseServiceRoleKey
  const brewGuideUserId = process.env.BREW_GUIDE_USER_ID ?? config.brewGuideUserId ?? 'default_user'

  if (!supabaseUrl) throw new Error('Missing supabaseUrl. Run `brew-guide init`.')
  if (!supabaseServiceRoleKey) throw new Error('Missing supabaseServiceRoleKey. Run `brew-guide init`.')

  return { supabaseUrl, supabaseServiceRoleKey, brewGuideUserId }
}
```

---

## 成功标准

- [ ] `npm install -g brew-guide-cli` 后可直接运行 `brew-guide --help`
- [ ] `bean add --dry-run` 打印将要写入的 JSON，不实际操作 Supabase
- [ ] `note add --dry-run` 同上
- [ ] `bean add`（无 `--dry-run`）正确写入 Supabase，返回新 ID
- [ ] `bean list` / `note list` 正确查询并返回记录
- [ ] `roasters` 返回去重烘焙商列表
- [ ] 配置三源优先级正确解析
- [ ] `brew-guide init` 引导创建 `~/.config/brew-guide/config.json`（权限 600）
- [ ] Skill 驱动 agent 完整走通「dry-run 预览 → 确认 → 写入」流程
- [ ] 零 OpenClaw 依赖

---

## 设计文档

- [BDD 规格说明](./bdd-specs.md) — 行为场景与测试策略
- [架构详情](./architecture.md) — 系统架构与组件细节
- [最佳实践](./best-practices.md) — 安全、输出格式、错误处理
