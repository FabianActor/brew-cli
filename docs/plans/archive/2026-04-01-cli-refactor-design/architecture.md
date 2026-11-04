# 架构详情

## 技术栈选型

| 组件 | 选型 | 理由 |
|---|---|---|
| CLI 框架 | **Citty** (`citty`) | UnJS 生态，原生 TypeScript，极轻量，内置子命令和参数解析 |
| 配置管理 | **c12** (`c12`) | UnJS 生态，支持 globalRc + dotenv + defaults 优先级合并 |
| 构建工具 | **tsup** | 基于 esbuild，自动注入 shebang，ESM 输出，零配置 |
| 开发运行 | **tsx** | 无需构建即可运行 `.ts` 文件，用于本地迭代 |

---

## Citty 子命令实现模式

```typescript
// src/commands/bean/add.ts
import { defineCommand } from 'citty'
import { resolveConfig } from '../../config.js'
import { createSupabaseClient } from '../../client.js'
import { executeUpsertBean } from '../../tools/upsertBean.js'

export default defineCommand({
  meta: { name: 'add', description: '新增咖啡豆记录' },
  args: {
    name:          { type: 'string', required: true,  description: '咖啡豆名称' },
    roaster:       { type: 'string', required: true,  description: '烘焙商' },
    origin:        { type: 'string', required: true,  description: '产地' },
    process:       { type: 'string', required: true,  description: '处理法' },
    variety:       { type: 'string', required: false, description: '品种' },
    'roast-level': { type: 'string', required: false, description: '烘焙程度' },
    'roast-date':  { type: 'string', required: false, description: '烘焙日期 (ISO)' },
    price:         { type: 'string', required: false, description: '价格' },
    capacity:      { type: 'string', required: false, description: '规格 (如 150G)' },
    'bean-type':   { type: 'string', required: false, description: 'filter | espresso' },
    flavor:        { type: 'string', required: false, description: '风味，逗号分隔' },
    notes:         { type: 'string', required: false, description: '备注' },
    'dry-run':     { type: 'boolean', required: false, description: '打印将要写入的数据，不实际执行' },
    format:        { type: 'string', required: false, description: 'human | json (默认 human)' },
  },
  async run({ args }) {
    const flavor = args.flavor
      ? args.flavor.split(',').map((f: string) => f.trim()).filter(Boolean)
      : undefined

    const beanData = {
      name: args.name,
      roaster: args.roaster,
      origin: args.origin,
      process: args.process,
      variety: args.variety,
      roastLevel: args['roast-level'],
      roastDate: args['roast-date'],
      price: args.price,
      capacity: args.capacity,
      beanType: args['bean-type'],
      flavor,
      notes: args.notes,
    }

    // Dry run: print data without writing to Supabase
    if (args['dry-run']) {
      if (args.format === 'json') {
        console.log(JSON.stringify({ dryRun: true, bean: beanData }))
      } else {
        console.log('[dry-run] Would create bean:')
        console.log(JSON.stringify(beanData, null, 2))
      }
      return
    }

    const config = await resolveConfig()
    const supabase = createSupabaseClient(config)

    const result = await executeUpsertBean(supabase, config, { bean: beanData })

    if (args.format === 'json') {
      console.log(JSON.stringify({ message: result.content[0].text }))
    } else {
      console.log(result.content[0].text)
    }
  },
})
```

```typescript
// src/commands/bean/index.ts
import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'bean', description: '管理咖啡豆记录' },
  subCommands: {
    add:  () => import('./add.js').then(r => r.default),
    list: () => import('./list.js').then(r => r.default),
  },
})
```

```typescript
// src/main.ts
import { defineCommand, runMain } from 'citty'

const main = defineCommand({
  meta: {
    name: 'brew-guide',
    version: '0.2.0',
    description: '咖啡豆与冲煮记录 CLI',
  },
  subCommands: {
    init:     () => import('./commands/init.js').then(r => r.default),
    bean:     () => import('./commands/bean/index.js').then(r => r.default),
    note:     () => import('./commands/note/index.js').then(r => r.default),
    roasters: () => import('./commands/roasters.js').then(r => r.default),
  },
})

runMain(main)
```

---

## 配置系统

### 优先级链

```
1. 环境变量（最高优先）
   BREW_GUIDE_SUPABASE_URL
   BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY
   BREW_GUIDE_USER_ID

2. .env 文件（cwd 下）
   同上变量名

3. ~/.config/brew-guide/config.json
   { "supabaseUrl": "...", "supabaseServiceRoleKey": "...", "brewGuideUserId": "..." }

4. 默认值（最低优先）
   brewGuideUserId: "default_user"
```

### c12 配置说明

- `globalRc: true` → 读取 `~/.config/brew-guide/config.json`
- `dotenv: true` → 自动加载 cwd `.env` 到 `process.env`
- 环境变量映射需手动处理（c12 不自动映射 `BREW_GUIDE_SUPABASE_URL` → `supabaseUrl`）

### `brew-guide init` 实现

```typescript
import { defineCommand } from 'citty'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

export default defineCommand({
  meta: { name: 'init', description: '初始化 Supabase 配置' },
  async run() {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const url = await rl.question('Supabase URL (https://xxx.supabase.co): ')
    const key = await rl.question('Service Role Key: ')
    const uid = await rl.question('User ID [default_user]: ')
    rl.close()

    const dir = join(homedir(), '.config', 'brew-guide')
    await mkdir(dir, { recursive: true })
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        supabaseUrl: url.trim(),
        supabaseServiceRoleKey: key.trim(),
        brewGuideUserId: uid.trim() || 'default_user',
      }, null, 2),
      { mode: 0o600 }, // 仅文件所有者可读写
    )
    console.log(`配置已保存至 ${configPath}`)
  },
})
```

---

## 构建配置

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { main: 'src/main.ts' },
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',  // 关键：让 OS 直接执行
  },
})
```

---

## package.json 变更对照

| 字段 | 变更前 | 变更后 |
|---|---|---|
| `name` | `openclaw-brew-guide-supabase` | `brew-guide-cli` |
| `bin` | 无 | `{ "brew-guide": "./dist/main.js" }` |
| `files` | `["index.ts", "src/", ...]` | `["dist/", "skills/"]` |
| `dependencies` | typebox, supabase-js | supabase-js, **citty, c12** |
| `devDependencies` | typescript | typescript, **tsup, tsx** |
| `scripts.build` | 无 | `tsup` |
| `scripts.dev` | 无 | `tsx src/main.ts` |
| `openclaw` key | 有 | **删除** |
| `keywords` | openclaw-plugin, ... | **cli**, brew-guide, supabase, coffee |

---

## CLI 参数到 Tool 参数映射

### `brew-guide bean add` → `executeUpsertBean`

| CLI flag | bean 字段 | 必填 |
|---|---|---|
| `--name` | `name` | ✅ |
| `--roaster` | `roaster` | ✅ |
| `--origin` | `origin` | ✅ |
| `--process` | `process` | ✅ |
| `--variety` | `variety` | — |
| `--roast-level` | `roastLevel` | — |
| `--roast-date` | `roastDate` | — |
| `--price` | `price` | — |
| `--capacity` | `capacity` | — |
| `--bean-type` | `beanType` | — |
| `--flavor` | `flavor` (逗号分隔 → array) | — |
| `--notes` | `notes` | — |
| `--dry-run` | （不传给 tool，仅打印数据跳过写入） | — |

### `brew-guide note add` → `executeUpsertNote`

| CLI flag | note 字段 | 必填 |
|---|---|---|
| `--bean-id` | `beanId` | ✅ |
| `--method` | `method` | ✅ |
| `--grind-size` | `grindSize` | — |
| `--water-temp` | `waterTemp` (Number) | — |
| `--ratio` | `ratio` | — |
| `--brew-time` | `brewTime` | — |
| `--flavor` | `flavor` | — |
| `--score` | `score` (Number) | — |
| `--memo` | `memo` | — |
| `--brewed-at` | `brewedAt` | — |
| `--dry-run` | （不传给 tool，仅打印数据跳过写入） | — |

### `brew-guide bean list` / `brew-guide note list` → `executeListRecent`

| CLI flag | 参数 | 默认值 |
|---|---|---|
| `--limit` | `limit` | 20 |
| table | 硬编码（bean=coffee_beans, note=brewing_notes）| — |

> `--include-deleted` 已移除（不支持删除功能，此参数无意义）

---

## Skill 与 CLI 的交互模式

Skill（`skills/brew-guide/SKILL.md`）需要重写，将所有工具调用改为 shell 命令。

主要变化：

```markdown
# 旧（OpenClaw 工具调用）
[Call brew_guide_upsert_bean with { bean: { name: "...", roaster: "..." } }]

# 新（CLI 命令）
brew-guide bean add --name "..." --roaster "..."
```

Skill 负责：
1. 引导 agent 收集完整信息（交互流程不变）
2. 执行 `brew-guide roasters` 做烘焙商名称匹配
3. 构造完整 CLI 命令并执行
4. 解析 CLI 输出获取创建的 ID
