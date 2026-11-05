# brew-cli

在终端里管理 [brew-guide](https://github.com/chuthree/brew-guide) 的数据：咖啡豆、冲煮记录、器具与配方、烘焙商，直接读写它用的 Supabase 表。

数据和应用里看到的是同一份——手机上刷新就能看到你在终端里记的那一杯。

每个版本改了什么见 [CHANGELOG.md](CHANGELOG.md)。

---

## 安装

需要 Node.js >= 18。

```bash
npm install -g @fabianactor/brew-cli
brew-guide --version
```

包名是 `@fabianactor/brew-cli`（`brew-cli` 在 npm 上被人下架过，名字锁死了，用不了），装完的命令叫 `brew-guide`（跟它操作的那款应用同名）。不想全局装就用 `npx @fabianactor/brew-cli bean list`。

macOS 上用系统自带的 Node 装可能会 `EACCES: permission denied` —— 那是系统目录不给写，别用 `sudo`，改用 nvm / fnm 这类版本管理器，或者把前缀指到用户目录：`npm install -g @fabianactor/brew-cli --prefix ~/.npm-global`（之后把 `~/.npm-global/bin` 加进 `PATH`）。

从源码装：

```bash
git clone https://github.com/FabianActor/brew-cli.git
cd brew-cli
npm install
npm run build
npm link        # 把 brew-guide 挂到全局 PATH
```

之后改代码只要再跑一次 `npm run build` 就生效，不用重装。

想装内嵌的 Agent skill（让 AI 助手知道怎么用这套命令）：

```bash
npx skills add github.com/FabianActor/brew-cli -y -g
```

## 配置

```bash
brew-guide init
```

会依次问三样东西：

| 项 | 说明 |
| --- | --- |
| Supabase URL | 你的项目地址，结尾的 `/` 会自动去掉 |
| API key | **publishable** key 就够（旧名 `anon`，在 Legacy API keys 标签里）；**不需要** service_role / secret key。输入时不回显，存在配置文件的 `supabaseKey` 字段 |
| User ID | 同步用的用户标识，默认 `default_user` |

为什么 publishable 就够：brew-guide 自带的 schema 对五张表都开了 `USING (true)` 宽 RLS，还对 `anon` 显式授了增删改查——权限边界**就是** RLS 本身，换个人拿到同一把 key 也是这个权限。**它不能绕过 RLS**：表上没有对应策略的库，这把 key 一样被拒。想收窄的话得改策略，不是换 key。

配置写到 `~/.config/brew-guide/config.json`，想换位置就设 `BREW_GUIDE_CONFIG_PATH`。老版本写下的 `supabaseServiceRoleKey` 字段仍能读（会提示一次改名），新写的都是 `supabaseKey`。

> **前置条件**：`roasters` 命令需要库里存在 `public.get_all_roasters()` 函数，brew-guide 自带的 schema 里没有。没建也不会默默失败——跑 `roasters` 时它会把下面的 SQL 直接打给你，贴进 Supabase SQL Editor 跑一次即可。

<details>
<summary>建函数的 SQL</summary>

```sql
create or replace function public.get_all_roasters()
returns table (roaster text)
language sql
stable
as $$
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
$$;
```
</details>

想换配置就跑 `brew-guide init`，或直接改那个 JSON。

---

## 四个常用场景

### 1. 查豆

```bash
# 最近加的 10 款
brew-guide bean list --limit 10

# 按产区 / 处理法 / 品种 / 产国 / 批次找（包含匹配，--region 古吉 能命中「古吉 罕贝拉」）
brew-guide bean list --region 古吉 --has-remaining true
brew-guide bean list --country Ethiopia --batch "Lot 26"

# 看一款的完整字段
brew-guide bean get bean_xxx

# 还剩什么烘焙商
brew-guide roasters
```

### 2. 加一款豆

> **先在 App 里打开这些字段**：设置 → 咖啡豆 → 咖啡豆字段，勾选 烘焙商、产地、产区、庄园、处理站、海拔、处理法、品种。没勾的字段在应用里看不到，等于白写。
>
> 一个当前限制：**产国与产地在后端是同一个字段**（开产国就得把国家从产地搬走，否则同一信息存两处）。批次写在 `blendComponents[0].batch`，App 里勾了批次就能看到。

```bash
brew-guide bean add \
  --name "罕贝拉 日晒" --roaster "MAME" \
  --country "埃塞俄比亚" --region "古吉 罕贝拉" \
  --estate "Buku Sayisa" --process "日晒" \
  --variety "原生种" --altitude "2350-2460m" \
  --roast-level "浅度烘焙" --capacity 100 --price 128
```

烘焙度不给就留空（以前会按豆种猜一个，猜错就污染 App 的筛选）。`--start-day` / `--end-day` 不给时按烘焙度取 App 的同一套预设：浅烘 7/60、中烘 10/60、深烘 14/90。

状态相关的三个开关：

```bash
# 还没到手
brew-guide bean add --name "..." --roaster "..." --origin "肯尼亚" --process "水洗" --in-transit

# 冷冻保存（和在途互斥，开一个就把另一个关掉；取消用 --no-in-transit / --no-frozen）
brew-guide bean update bean_xxx --is-frozen

# 生豆（记购买日期，没有赏味期和烘焙度）
brew-guide bean add --name "..." --roaster "..." --origin "巴西" --process "日晒" \
  --bean-state green --purchase-date 2026-10-20
```

生豆和熟豆是两套日期语义：生豆记**购买日期**，熟豆记**烘焙日期**，App 不会同时显示两个。所以 `--bean-state green` 和 `--roast-date` 是冲突的，同时给会直接报错；转回熟豆要给 `--roast-date`，否则 App 里那颗豆会显示「未设置烘焙日期」。

`--price` 只收数字（`88`、`88.5`，也认 `¥88`、`88元` 这种写法），存成字符串给 App 算「元/克」。

拼配用可重复的 `--component`：
```bash
brew-guide bean add --name "三重奏" --roaster "TRIOON" \
  --component "region=卡哈马卡;process=水洗" \
  --component "region=库斯科;process=日晒;percentage=40"
```

字段怎么拆（产地/产区/庄园/处理站怎么分工）见 `skills/brew-guide/references/bean-add.md`。

### 3. 记一杯

```bash
# 记完自动扣余量（--with-note 会连记录一起写）
brew-guide note add --bean-id bean_xxx --method "V60" \
  --equipment "冰瞳 B75" --rating 4.5 --notes "莓果，尾段偏甜" \
  --coffee 15g --water 225g --water-temp 92

# 翻最近的记录，按日期/评分筛
brew-guide note list --limit 10
brew-guide note list --from 2026-10-01 --to 2026-10-31 --min-rating 4

# 只想扣粉量、不记记录
brew-guide bean consume bean_xxx --amount 15
```

`--rating` 只收 0-5（超范围直接报错）；`--water-temp` 收 `92` 或 `92°C`，一律写成 `92°C`；`--equipment` 会校验，内置 V60 / CleverDripper / Kalita / Origami / Orea / Sinloy / Espresso 直接认，自定义器具要写 `equipment list` 里的 ID。

给了 `--bean-id` 时，记录里会自动存一份豆子快照（名字、烘焙度、烘焙日期、烘焙商），和 App 里点「记录一杯」一样；以后豆子改名，旧记录仍显示当时的样子。

### 4. 管器具和配方

```bash
brew-guide equipment list
brew-guide equipment add --name "V60" --id "V60" --animation-type v60
brew-guide method list
brew-guide method add --name "三段式" --equipment-id "V60" --stages-json '[{"label":"焖蒸","water":"30g","duration":15,"detail":"注入 30g 水，等 15 秒"}]'
```

`--id` 撞已有器具会报错停下，确认要替换才加 `--force`。

### 备份

```bash
brew-guide backup                       # 默认 brew-guide-backup-<timestamp>.json
brew-guide backup --out "D:\bk\brew.json"
```

导出 `coffee_beans` / `brewing_notes` / `custom_equipments` / `custom_methods` / `user_settings` 的原始行（含软删），可以直接当离线快照。**批量改库之前先跑一次。**

### 更新检查

```bash
brew-guide update-check                 # 现在就去 npm 上查一次
brew-guide update-check --format json   # {"current","latest","upgradable","source"}
```

平时不用管：每条命令结束前会看一眼本地缓存，发现 npm 上有更新的版本就在 stderr 提醒一次（24 小时最多查一次，同一个版本只提示一次）。提示永远不联网等结果，所以不会拖慢命令；离线、被墙、registry 抽风都只是静默不提示。

不想被提醒就设 `BREW_GUIDE_NO_UPDATE_CHECK=1`（`update-check` 子命令本身不受影响，它只是不自动查）。

---

## 命令总览

| 命令 | 干什么 |
| --- | --- |
| `bean add / get / update / delete / consume` | 咖啡豆：新增、详情、修改、软删、扣余量 |
| `bean list` | 列表，支持烤度、豆种、烘焙商、产区、处理法、品种、产国、批次、有无余量筛选 |
| `note add / get / update / delete` | 冲煮记录：新增、详情、修改、软删 |
| `note list` | 列表，支持器具、方法、豆子、评分、日期区间筛选 |
| `equipment add / get / update / delete / list` | 器具 |
| `method add / get / update / delete / list` | 冲煮配方（`--stages-json` 传分段注水步骤） |
| `roasters` | 库里出现过的烘焙商 |
| `backup` | 整库导出成 JSON |
| `update-check` | 查 npm 上有没有新版本 |
| `init` | 写配置 |

每个命令的完整参数用 `--help` 看，例如 `brew-guide bean add --help`。

## 全局选项

| 选项 | 行为 |
| --- | --- |
| `--format json` | 输出紧凑单行 JSON，走 stdout；警告、进度、错误一律走 stderr，可以直接 `| jq` |
| `--dry-run` | 写入类命令打印将要发送的载荷，不发请求 |

**参数名写错会直接 `exit 2` 并列出可用参数**，不会静默忽略。

## 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 运行时失败（记录不存在、写入被拒等） |
| 2 | 参数用法错误（缺必填、取值非法、空字符串、拼错的 flag） |
| 64 | 配置缺失或非法（先跑 `brew-guide init`） |
| 65 | 网络 / Supabase 请求失败 |

## 常见问题

**中文 Windows 上 `brew-guide ... --format json | ConvertFrom-Json` 报 JSON 解析错误。**
不是 JSON 坏了，是控制台用 GBK 解码了 UTF-8 输出，中文把引号吃掉了。两种解法任选：

```powershell
chcp 65001                                  # 只影响当前窗口
[Console]::OutputEncoding = [Text.Encoding]::UTF8   # 当前会话生效
```

在意的是「CLI 的输出是 UTF-8」这件事 —— 写文件再用 `Get-Content -Encoding utf8` 读也一样可靠。

**`list` 只出来 20 条。** 默认 `--limit 20`，命中上限时 stderr 会提示；要看更多就 `--limit 200`。

## 数据模型备注

- 业务字段都在各表的 `data` JSONB 里；`data` 里的时间值是**毫秒数**，不是 ISO 字符串。
- 产地写在 `data.blendComponents[]`；写入时扁平字段（`--origin` 等）会被合并进第一个成分并从顶层删除。
- 主键是 `(id, user_id)`，写入走 upsert，没有物理删除。
- **写入会复活软删记录**：所有写入都带 `deleted_at: null`，对一条已软删的 `id` 再 `add`/`update` 会让它重新出现。
- `list` 默认只读 `deleted_at is null` 的行。

更细的约定见 [docs/supabase.md](docs/supabase.md)。

## 开发

```bash
npm install
npm run dev -- bean list      # 直接跑源码
npm run typecheck             # tsc --noEmit
npm test                      # typecheck + node --test
npm run build                 # tsup → dist/
npm link                      # 改完只想本地用：build 一次就生效
```

改完 skill 文档记得同步：`npx skills add ./skills/brew-guide -g -y`。

> **发布**：改 `package.json` 版本号 → 提交 → `git tag v0.2.x && git push origin v0.2.x`。CI 跑 typecheck / build / test 后，用 npm trusted publishing（OIDC）直接发布并自动附 provenance — **不需要任何 npm token**。
>
> 发布链的前置条件（一次性）：npm 包里登记 trusted publisher（user `FabianActor`、repo `brew-cli`、workflow `publish.yml`），Publishing access 设为「Require 2FA and disallow tokens」。配置建好后**两天内必须成功发布一次**，否则作废。`0.2.0` 是手动发的一次性引导，`0.2.1` 起全部走 tag + OIDC。
>
> 想验证包内容但不发布：`npm pack --dry-run`。
>
> 改了用户可见的行为，记得在 [CHANGELOG.md](CHANGELOG.md) 里补一条。

## License

MIT。本仓库是 [swiftwind0405/brew-guide-cli](https://github.com/swiftwind0405/brew-guide-cli) 的 fork，现由 FabianActor 维护；上游部分的版权归原作者，改动部分的版权与责任归本仓库维护者，改动的归属写在 [NOTICE](NOTICE) 里，具体改了哪些见 `git log`。
