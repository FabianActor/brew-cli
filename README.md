# brew-guide-cli

独立的 Citty 命令行工具，让你可以直接操作 [brew-guide](https://github.com/chuthree/brew-guide) 的 Supabase 数据同步表。

## 简介

本项目已从原先的 OpenClaw 工具插件重构为独立的命令行工具。你可以用它在终端上直接管理咖啡豆 (bean)、冲煮记录 (note) 和查看烘焙商 (roasters) 列表。

## 前置条件

- Node.js >= 18
- 一个已初始化 brew-guide schema 的 Supabase 项目
- **【必要配置】** 需要在 Supabase 数据库里创建一个函数：`public.get_all_roasters()`，它会从：
   - `public.coffee_beans.data->>'roaster'`
   - `public.brewing_notes.data->>'roaster'`
里取值、过滤空值，并做去重后返回 text 列表。
```sql
  select distinct trim(both from r.roaster) as "roaster"
  from (
    select jsonb_extract_path_text("data", 'roaster') as roaster
    from "public"."coffee_beans"
    where "deleted_at" is null

    union all

    select jsonb_extract_path_text("data", 'roaster') as roaster
    from "public"."brewing_notes"
    where "deleted_at" is null
  ) as r
  where r.roaster is not null
    and btrim(r.roaster) <> ''
  order by 1;
```

## 安装

你可以通过 npm 直接将其安装到全局环境中：

```bash
npm install -g brew-guide-cli
```

安装后，`brew-guide` 命令即可在终端中全局可用。

## 直接 Agent 对话配置

```txt
帮我通过以下命令安装`brew-guide-cli`: `npm install -g brew-guide-cli` ，然后通过以下命令安装相关 skills `npx skills add github.com/FabianActor/brew-guide-cli -y -g` 。安装完成后，根据`https://github.com/FabianActor/brew-guide-cli/blob/master/README.md`进行openclaw里面的所有配置。
```


## 初始化配置

首次使用前，需要配置 Supabase 连接信息：

```bash
brew-guide init
```

执行后会交互式提示输入以下信息：
1. **Supabase URL**: 你的 Supabase 项目 URL (例如: `https://your-project.supabase.co`)，结尾的 `/` 会自动去掉
2. **Service Role Key**: 你的 Supabase service role 密钥（输入时不回显）。若你的表已经对 `anon` 角色放开读写（`brew-guide` 自带的 schema 就是 `USING (true)` 宽 RLS），填 publishable / anon key 同样能用，此时权限边界完全由 RLS 决定
3. **User ID**: 同步记录到 brew-guide 时的用户标识 (默认值为 `default_user`)

> 默认情况下，配置会保存在 `~/.config/brew-guide/config.json`。你也可以通过环境变量 `BREW_GUIDE_CONFIG_PATH` 来自定义配置文件路径。

## CLI 工具说明

CLI 提供了以下层级的命令：

### 管理咖啡豆 (`bean`)

```bash
# 查看帮助
brew-guide bean --help

# 1. 列表查询咖啡豆
brew-guide bean list --limit 10

# 2. 添加咖啡豆（至少一个成分要带 origin 和 process）
brew-guide bean add --name "Yirgacheffe" --roaster "Tim Wendelboe" --origin "Ethiopia" --process "Washed"

# 2b. 结构化成分字段（产区 / 庄园 / 处理站 / 海拔 / 批次）
brew-guide bean add --name "罕贝拉 日晒" --roaster "MAME" \
  --country "埃塞俄比亚" --region "古吉 罕贝拉" --estate "Buku Sayisa" \
  --process "日晒" --variety "原生种" --altitude "2350-2460m"

# 2c. 拼配：--component 可重复
brew-guide bean add --name "三重奏" --roaster "TRIOON" \
  --component "region=卡哈马卡;process=水洗" --component "region=库斯科;process=日晒;percentage=40"
```

> **可选参数说明**：除成分字段外，还可提供 `--roast-level`, `--roast-date`, `--price`, `--capacity`, `--bean-type`, `--flavor`, `--notes` 完善咖啡豆信息。
> 成分字段（`--origin/--country/--region/--estate/--processing-station/--process/--variety/--altitude/--batch/--percentage`）作用于第一个成分；`update` 时可用 `--component-index N` 指定第几个成分（从 1 开始），或 `--component` 整组替换。
> `bean add` / `bean update` 会校验参数名：拼错的 flag 直接 `exit 2` 并列出可用参数，不会静默忽略。
> `bean list` 支持筛选：`--roast-level`, `--bean-type`, `--roaster`, `--region`, `--process`, `--variety`, `--has-remaining true|false`。产区/处理法/品种是**包含匹配**（`--region 古吉` 能命中「古吉 罕贝拉」）。

### 管理冲煮记录 (`note`)

```bash
# 查看帮助
brew-guide note --help

# 1. 列表查询冲煮记录
brew-guide note list --limit 10

# 2. 添加冲煮记录 (需基于 bean-id 关联)
brew-guide note add --bean-id "YOUR_BEAN_ID" --method "V60" 
```

> **可选参数说明**：`--notes`, `--rating`, `--total-time`, `--source`, `--equipment`, `--taste-body/--taste-acidity/--taste-sweetness/--taste-bitterness` 为当前真实字段；
> `--coffee`, `--water`, `--grind-size`, `--water-temp`, `--ratio`, `--brew-time`, `--flavor`, `--score`, `--memo`, `--brewed-at` 是兼容旧脚本的别名，会被归一到真实字段（`--coffee/--water` 进 `params.coffee` / `params.water`）。
> `--bean-id` 会在写入前校验豆子是否存在；未声明的 flag 会 `exit 2` 并列出可用参数。
> `note list` 支持 `--equipment`, `--method`, `--bean-id`, `--min-rating`, `--from`, `--to`（日期可用 `YYYY-MM-DD` 或 ISO 时间，含当天）。

### 备份 (`backup`)

```bash
# 导出全部表到本地 JSON（默认 brew-guide-backup-<timestamp>.json）
brew-guide backup

# 指定路径；--include-deleted false 只导未软删的行
brew-guide backup --out "D:\backups\brew-2026-11.json"
```

导出 `coffee_beans`、`brewing_notes`、`custom_equipments`、`custom_methods`、`user_settings` 的原始行（含 `deleted_at`），可直接当离线备份。

### 查看烘焙商 (`roasters`)

```bash
# 查看帮助
brew-guide roasters --help

# 列出所有已经录入系统的不同烘焙商名称
brew-guide roasters
```

## 全局选项

无论是 `add` 还是查询列表，大多数命令支持以下可选修饰参数：

- `--format json`: 将输出内容严格格式化为 JSON 字符串。不仅方便终端查看，且非常适合用于后续脚本处理或其他自动化工具读取。JSON 走 stdout 且是单行紧凑格式；警告、进度、错误一律走 stderr，方便 `| jq` 或管道。
- `--dry-run`: 仅可用在写入操作中（如 `add`），终端会打印将插入到 Supabase 中的载荷数据，但不发送真实网络请求。

## 数据约束

本工具严格遵守 brew-guide 的 Supabase 原则和同步模型：
- 本工具为独立 CLI 工具，原 OpenClaw 相关的插件依赖已被剥离。
- 所有数据挂载至统一的 `user_id`（由 `init` 配置）。
- 写入数据时自动维护 `created_at`（首次插入）和 `updated_at`（每次变更）。
- 业务数据包裹并存放在对应表的 `data` JSONB 字段下。
- 支持 UPSERT 功能（通过 `onConflict 'id,user_id'` 限制条件），不提供直接的彻底物理删除。
- **写入会复活软删记录**：所有写入都带 `deleted_at: null`，对一条已软删的 `id` 执行 `add`/`update` 会让它重新出现在应用里。
- 软删只是把 `deleted_at` 填上，行本身仍在，`list` 类命令默认只读 `deleted_at is null` 的行。

## 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 运行时失败（记录不存在、写入被拒等） |
| 2 | 参数用法错误（缺必填、取值非法、空字符串） |
| 64 | 配置缺失或非法（先跑 `brew-guide init`） |
| 65 | 网络 / Supabase 请求失败 |

## 开发测试

```bash
# 安装依赖
npm install

# 运行本地开发调试
npm run dev -- init
npm run dev -- bean list

# 类型检查与打包
npm run typecheck
npm run build

# 监听源码变更并自动重新构建 dist/
npm run build:watch
```

### 在 OpenClaw 中本地测试

如果你正在修改此 CLI 工具，可以通过以下步骤直接在本地 Agent (如 Gemini/OpenClaw) 中测试你的改动：

1. **链接本地 CLI 命令**：
   ```bash
   npm run build
   npm link
   ```
   *这会将当前项目的构建输出链接到全局 `brew-guide` 命令。由于命令已全局就绪，后续每次代码更改后只需再次运行 `npm run build` 即可生效。*

2. **安装并链接本地 Skill**：
   将本项目的本地 skill 挂载到 OpenClaw 中：
   ```bash
   npx skills add ./skills/brew-guide -g -y
   ```
   *这能确保你的 Agent 获悉并使用本项目内嵌的最新的 SKILL 文件和操作逻辑。*

3. **进行对话联调**：
   你可以重启 Agent 会话进行测试要求，例如：“调用 brew-guide 查询我最近添加的咖啡豆”，并验证 Agent 能够正常触发本地二进制文件进行处理并联调。

## 发布更新流程

本项目已配置 GitHub Actions 自动发布流程。当你想发布新版本到 npm 时，请按以下步骤操作：

1. 在本地通过 npm 更新版本号并生成对应的 Git Tag：
   ```bash
   npm version patch  # 可以依据涉及变动大小替换为 minor 或 major
   ```
2. 将代码与 tag 提交推送到远端：
   ```bash
   git push origin master --tags
   ```
推送 tag 之后，GitHub Actions 将会自动执行安全检查并将构建更新发布到 npm Registry。

## License

MIT
