# OpenClaw `brew-guide-supabase` 插件设计方案（最小可跑版）

## 1. 目标

这个方案的目标非常单一：

- 让 **OpenClaw 里的 agent** 能直接操作 `brew-guide` 使用的 Supabase 数据。
- 让 **brew-guide 浏览器应用** 继续用现有的 Supabase 同步逻辑工作。
- 先做 **单用户、最小闭环**，不做复杂多用户权限和高级运维。
- 基于 **Supabase Free** 先跑通，再决定后续是否升级 Pro 或迁移。

该方案不要求改造 `brew-guide` 的本地数据库架构，也不要求一开始做独立中间后端。

---

## 2. 关键判断

### 2.1 brew-guide 的 Supabase 同步模型

`brew-guide` 当前的 Supabase 方案不是把 JSON 备份文件放进对象存储，而是直接对业务表做同步。项目里已经有 `realtime`、`syncOperations`、`schema`、`types` 等模块；同步代码里也明确使用 `(id, user_id)` 做 upsert 和 `deleted_at` 软删除。当前默认 `user_id` 是固定的 `default_user`。因此它很适合先做一个 **单用户工具型插件**。  

涉及的核心表包括：

- `coffee_beans`
- `brewing_notes`
- `custom_equipments`
- `custom_methods`
- `user_settings`

每张表都围绕 `id`、`user_id`、`data JSONB`、`updated_at`、`deleted_at` 等字段组织。同步模块还会按 `user_id = default_user` 拉取和 upsert 记录。

---

### 2.2 OpenClaw 插件模型

OpenClaw 当前支持通过原生插件注册 **agent tools、HTTP routes、hooks、CLI commands、services** 等能力。对于非消息通道插件，官方推荐使用 `definePluginEntry`，并通过 `api.registerTool(...)` 注册工具；每个原生插件都必须带 `openclaw.plugin.json` manifest，而且运行时依赖要放在插件自己的 `dependencies` 中。  

因此，最小插件不需要实现 channel/plugin provider，只要实现一个 **tool plugin** 即可。

---

## 3. 最小可跑架构

### 3.1 架构图

```text
OpenClaw Agent
    ↓ tool call
OpenClaw Plugin: brew-guide-supabase
    ↓ service role key
Supabase Tables
    ↓ existing sync logic / realtime
brew-guide browser app
```

### 3.2 设计原则

- **插件直接操作 Supabase**，不再额外引入中间 HTTP backend。
- 插件只暴露少量固定工具，不允许模型生成任意 SQL。
- 第一版限定为 **单用户**。
- 第一版只覆盖最核心的数据操作：
  - 新增/更新咖啡豆
  - 新增/更新冲煮记录
  - 软删除记录
  - 查询最近记录
- 通过环境变量或插件配置保存 Supabase 连接信息。
- 将带副作用的工具设置为 **optional tool**，要求显式允许。

---

## 4. 插件能力范围

### 4.1 第一版工具列表

建议插件只提供以下 4 个工具：

1. `brew_guide_upsert_bean`
2. `brew_guide_upsert_note`
3. `brew_guide_delete_records`
4. `brew_guide_list_recent`

这是因为：

- 已经足够覆盖你当前“agent 操作 Supabase，应用直接同步可用”的目标。
- 和 `brew-guide` 现有同步模型一致。
- 避免过早暴露装备、方法、自定义预设等低优先级实体。

### 4.2 工具职责

#### `brew_guide_upsert_bean`

输入一条咖啡豆记录，写入 `coffee_beans`。

典型字段：

- `id`（可选）
- `name`
- `origin`
- `roaster`
- `process`
- `variety`
- `roastLevel`
- `purchaseDate`
- `roastDate`
- `notes`

行为：

- 若未传 `id`，插件生成 UUID。
- 以 `(id, user_id)` 执行 upsert。
- `updated_at` 自动写当前时间。
- `deleted_at = null`。
- 业务字段整体存进 `data` JSONB。

#### `brew_guide_upsert_note`

输入一条冲煮记录，写入 `brewing_notes`。

典型字段：

- `id`（可选）
- `beanId`
- `method`
- `grindSize`
- `waterTemp`
- `ratio`
- `brewTime`
- `flavor`
- `score`
- `memo`
- `brewedAt`

行为同上：upsert + 更新时间戳。

#### `brew_guide_delete_records`

对指定表中的指定记录执行软删除。

输入：

- `table`: `coffee_beans | brewing_notes | custom_equipments | custom_methods`
- `ids: string[]`

行为：

- 批量更新 `deleted_at = now()`
- 同时更新 `updated_at = now()`
- 不做物理删除

#### `brew_guide_list_recent`

查询最近记录，用于 agent 在写入前后做上下文判断。

输入：

- `table`
- `limit`
- `includeDeleted`（默认 false）

行为：

- 从指定表按 `updated_at desc` 查询
- 只返回摘要字段，不返回过大 payload

---

## 5. 为什么不做“任意 SQL 工具”

不建议给 agent 一个 `brew_guide_sql_query`：

- 模型很容易写出和现有同步模型不兼容的数据。
- `brew-guide` 当前依赖固定表结构、`data JSONB`、`updated_at`、`deleted_at`、`user_id`。
- 任意 SQL 会扩大破坏面，也会让后续升级成本上升。

正确做法是：

- 通过插件提供**受控工具面**。
- 工具内部再映射到 Supabase API。
- 这样后面即使你要改 schema，也只改插件实现，不改 agent 提示词和调用层。

---

## 6. 插件目录结构

建议目录结构如下：

```text
brew-guide-supabase/
  package.json
  openclaw.plugin.json
  index.ts
  src/
    config.ts
    client.ts
    tools/
      upsertBean.ts
      upsertNote.ts
      deleteRecords.ts
      listRecent.ts
    lib/
      ids.ts
      timestamps.ts
      sanitize.ts
      tables.ts
```

---

## 7. manifest 设计

`openclaw.plugin.json`：

```json
{
  "id": "brew-guide-supabase",
  "name": "Brew Guide Supabase",
  "description": "Adds agent tools for operating brew-guide data in Supabase.",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "supabaseUrl": {
        "type": "string",
        "minLength": 1
      },
      "supabaseServiceRoleKey": {
        "type": "string",
        "minLength": 1
      },
      "brewGuideUserId": {
        "type": "string",
        "default": "default_user"
      }
    },
    "required": ["supabaseUrl", "supabaseServiceRoleKey"]
  },
  "uiHints": {
    "supabaseUrl": {
      "label": "Supabase URL",
      "placeholder": "https://xxx.supabase.co"
    },
    "supabaseServiceRoleKey": {
      "label": "Supabase service role key",
      "sensitive": true
    },
    "brewGuideUserId": {
      "label": "brew-guide user id"
    }
  }
}
```

说明：

- `id` 必须和插件入口里的 `id` 保持一致。
- `configSchema` 是必填。
- `service role key` 只允许放在插件配置里，不能暴露给浏览器应用。

---

## 8. package.json 设计

```json
{
  "name": "@your-org/openclaw-brew-guide-supabase",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@sinclair/typebox": "^0.34.0",
    "@supabase/supabase-js": "^2.50.0"
  },
  "devDependencies": {
    "openclaw": "^2026.3.24-beta.2",
    "typescript": "^5.8.0"
  },
  "openclaw": {
    "extensions": ["./index.ts"],
    "compat": {
      "pluginApi": ">=2026.3.24-beta.2",
      "minGatewayVersion": "2026.3.24-beta.2"
    },
    "build": {
      "openclawVersion": "2026.3.24-beta.2",
      "pluginSdkVersion": "2026.3.24-beta.2"
    }
  }
}
```

说明：

- 运行时依赖必须放在插件自身 `dependencies`。
- 插件实现只从 `openclaw/plugin-sdk/*` 子路径导入，不要深引 core 内部模块。

---

## 9. 插件入口设计

`index.ts` 建议使用 `definePluginEntry`。

最小入口示意：

```ts
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { Type } from '@sinclair/typebox';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export default definePluginEntry({
  id: 'brew-guide-supabase',
  name: 'Brew Guide Supabase',
  description: 'Agent tools for brew-guide Supabase sync tables.',
  register(api) {
    const getConfig = () => {
      const cfg = api.getConfig?.() ?? {};
      return {
        supabaseUrl: cfg.supabaseUrl,
        supabaseServiceRoleKey: cfg.supabaseServiceRoleKey,
        brewGuideUserId: cfg.brewGuideUserId || 'default_user',
      };
    };

    const getClient = () => {
      const cfg = getConfig();
      return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);
    };

    api.registerTool(
      {
        name: 'brew_guide_upsert_bean',
        description: 'Create or update a brew-guide coffee bean record.',
        parameters: Type.Object({
          bean: Type.Object({}, { additionalProperties: true })
        }),
        async execute(_id, params) {
          const cfg = getConfig();
          const supabase = getClient();
          const bean = params.bean ?? {};
          const id = bean.id || `bean_${crypto.randomUUID()}`;
          const now = new Date().toISOString();

          const { error } = await supabase
            .from('coffee_beans')
            .upsert(
              {
                id,
                user_id: cfg.brewGuideUserId,
                data: { ...bean, id },
                updated_at: now,
                deleted_at: null,
              },
              { onConflict: 'id,user_id' }
            );

          if (error) {
            return { content: [{ type: 'text', text: `Failed: ${error.message}` }] };
          }

          return { content: [{ type: 'text', text: `Upserted coffee bean ${id}` }] };
        },
      },
      { optional: true }
    );
  },
});
```

正式实现时，把每个工具拆到独立文件，不要都堆在入口里。

---

## 10. 数据约束

为了和 `brew-guide` 现有同步逻辑兼容，插件必须遵守这些约束：

1. **固定 `user_id`**  
   第一版统一使用 `default_user`，或者让配置项默认它。

2. **统一 upsert 冲突键**  
   所有写入必须使用 `onConflict: 'id,user_id'`。

3. **统一时间戳字段**  
   每次修改都写 `updated_at = now()`。

4. **删除必须软删除**  
   只写 `deleted_at`，不做 hard delete。

5. **业务数据写进 `data JSONB`**  
   不要擅自向顶层表结构里塞额外业务字段。

6. **工具入参做轻校验**  
   至少检查 table 名、ids 是否为空、关键字段是否存在。

---

## 11. Supabase Free 的处理方式

你已经决定先用官方 Free，所以这里不追求“彻底解决”，只做最小兜底。

### 11.1 已知事实

- Free 项目会因为低活跃而被暂停。
- Pro 不会因为 inactivity 被暂停。

### 11.2 最小应对

插件层不需要处理这个问题，应该在部署层做：

1. 增加一个极轻量保活任务，每 3 到 5 天执行一次读请求。
2. agent 工具里对 Supabase 异常做友好提示，例如：
   - `Supabase project may be paused; check the project dashboard and restore it.`
3. 每周导出一次关键业务表作为备份。

第一版不要把“暂停恢复自动化”做进插件；这会显著增加复杂度，但收益不高。

---

## 12. OpenClaw 配置与启用建议

### 12.1 工具应设为 optional

原因：

- 这些工具有真实写入副作用。
- 不应该默认无门槛暴露给所有 agent 会话。

### 12.2 推荐 allowlist

在 OpenClaw 配置里显式允许：

```json5
{
  tools: {
    allow: [
      "brew_guide_upsert_bean",
      "brew_guide_upsert_note",
      "brew_guide_delete_records",
      "brew_guide_list_recent"
    ]
  }
}
```

### 12.3 推荐提示词约束

给 agent 的系统提示里建议增加：

- 修改咖啡数据前，先读最近相关记录。
- 删除操作必须先说明原因。
- 未确认的字段不要凭空编造。
- 不能调用不存在的 brew-guide 表。

---

## 13. 第一版不做的事情

为了确保最小闭环，这些内容明确不在第一版范围内：

- 多用户支持
- Supabase Auth 集成
- 真正严格的 RLS 重构
- 自定义装备/方法的全量覆盖
- 预设同步
- 插件内后台 service
- 插件内 HTTP route
- 自动恢复被暂停的 Supabase 项目
- 任意 SQL 工具
- 双向冲突解决策略优化

---

## 14. 实施步骤

### 阶段 A：准备 Supabase

1. 新建一个 Supabase Free 项目。
2. 在 SQL Editor 里执行 `brew-guide` 提供的 schema 初始化 SQL。
3. 在浏览器里先把 `brew-guide` 的 Supabase 同步跑通。
4. 验证前端新增一条豆子和一条冲煮记录都能落库。

### 阶段 B：开发 OpenClaw 插件

1. 建插件目录。
2. 写 `package.json`。
3. 写 `openclaw.plugin.json`。
4. 用 `definePluginEntry` 实现 4 个工具。
5. 本地安装并启用插件。
6. 把 4 个工具加入 `tools.allow`。
7. 用 agent 做一次真实写入测试。

### 阶段 C：联调

1. 通过 agent 新增一条 `coffee_beans`。
2. 打开 `brew-guide`，确认同步后可见。
3. 再通过 agent 新增一条 `brewing_notes`。
4. 在浏览器里确认记录正常出现。
5. 测试软删除是否在同步后生效。

---

## 15. 验收标准

满足以下 5 条就算第一版成功：

1. 插件能被 OpenClaw 正常识别和加载。
2. agent 能调用 `brew_guide_upsert_bean` 成功写入 Supabase。
3. brew-guide 浏览器应用同步后能看到该记录。
4. agent 能调用 `brew_guide_upsert_note` 成功写入冲煮记录。
5. agent 的软删除操作不会破坏同步链路。

---

## 16. 后续演进路线

第一版跑通后，再考虑这些升级：

### 16.1 第二阶段

- 增加 `custom_equipments` / `custom_methods` 工具
- 增加字段级摘要查询工具
- 增加输入 schema 校验和枚举规范化

### 16.2 第三阶段

- 用真实 Supabase Auth 用户替换 `default_user`
- 重写 RLS 策略
- 让插件支持多用户上下文

### 16.3 第四阶段

- 加 webhook / route
- 做 agent 操作审计日志
- 接入审批 hooks

---

## 17. 最终建议

对你当前阶段，最合理的方案不是：

- 自建 Supabase
- 先写中间后端
- 先做多用户权限
- 先做完整插件生态打包

而是：

**直接做一个 OpenClaw 工具插件，受控地操作 `brew-guide` 的 Supabase 同步表。**

这个方案的优点是：

- 改动最小
- 和现有 `brew-guide` 同步设计一致
- agent 能马上开始写数据
- 后面可以平滑升级到多用户或更严格权限模型

---

## 18. 参考依据

- OpenClaw 插件快速开始、tool plugin 入口、`definePluginEntry`、`api.registerTool(...)`、optional tools。  
- OpenClaw manifest 规则：每个原生插件都必须有 `openclaw.plugin.json`，并用 `configSchema` 做静态校验。  
- OpenClaw SDK 概览：插件可以注册 tools、hooks、HTTP routes、services，且应只从 `openclaw/plugin-sdk/*` 子路径导入。  
- `brew-guide` 现有 Supabase 同步模型：按 `(id, user_id)` upsert，默认 `user_id = default_user`，围绕 `coffee_beans`、`brewing_notes` 等业务表工作。
