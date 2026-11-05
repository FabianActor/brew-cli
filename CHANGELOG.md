# 更新日志

本文件记录 `@fabianactor/brew-cli` 的变更。0.2.0 之前的版本属于上游 [swiftwind0405/brew-guide-cli](https://github.com/swiftwind0405/brew-guide-cli)，本仓库从 0.2.0 起独立维护，之前的历史请直接看那个仓库。

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)，分类参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

**升级**：`npm install -g @fabianactor/brew-cli@latest`
**回滚**：`npm install -g @fabianactor/brew-cli@<版本号>`
**查当前版本**：`brew-guide --version`

每条都写了**旧行为是什么**——只看「已修复」判断不了自己的数据有没有受影响。破坏性变更单列一段，升级前扫一眼就够。

> `0.2.0` 当时是手动发布的一次性引导，没有打 tag，所以它的对比链接指向 npm 页面；`0.2.1` 起每个版本都有 `v*` tag。

---

## [未发布]

### 修复

- **`equipment list` / `method list` 的 ID 被截成前 8 位**：以前 `equipment list` 打出 `custom-o`、`method list` 打出 `method-1`（八条一模一样），复制出来根本没法当 `--equipment-id` 用。现在一律打完整 ID —— 列表存在的意义就是能拿去喂给下一条命令。
- **人类视图的列会错位**：以前空字段被直接从行里删掉，一列缺失后面整体左移（`note list` 里会把 `beanId` 读成冲煮手法、把评分读成备注）。现在空值占位成 `-`，列数固定。
- **`bean list` / `note list` 命中默认 `--limit 20` 时没有任何提示**：以前 `--country 埃塞俄比亚` 只出 20 条，看起来像总共就 20 条（实际 33 条）。现在命中上限会在 stderr 提示「只显示前 N 条，可能还有更多」——`--format json` 也提示（走 stderr，不污染 stdout 的 JSON）。
- **Windows 上 `--format json` 被管道/重定向时，中文会破坏 JSON 结构**：控制台用 936(GBK) 解码 CLI 的 UTF-8 输出，多字节字符错位会吃掉后面的引号，于是 `brew-guide bean list --format json | ConvertFrom-Json` 报 `After parsing a value an unexpected character was encountered: r. Path '[0].origin'`。现在 Windows 上输出不是交互终端时，JSON 里的非 ASCII 字符自动转成 `\uXXXX`，任何代码页都能解析；交互终端仍是原样中文。`BREW_GUIDE_JSON_ASCII=0/1` 可强制关闭/开启。

- **`note add` 的 `--bean-id` 和 `--method` 不再是必填**：App 的「记录一杯」里豆子和手法都可以不选（方法那一步本身能跳过），以前少给 `--method` 会先被 citty 拦下滑，连 `--rating 9` 这种参数错误都报不出来。现在两个都可选，只有给了 `--bean-id` 才校验豆子存在并写豆子快照。
- **`note add` 的 `--taste-*` 和 `--total-time` 越界/非法时静默丢弃**：以前 `--taste-body 7`、`--total-time abc` 都不报错，值直接没写进去（用的人不会知道）。现在越界直接 exit 2。

- **`update-check` 偶尔误报「查不到最新版本」**：手动查询原来沿用后台检查的 1.5 秒超时，而实测这个 registry 接口常要 1.5–2.5 秒才回应，于是同一条命令三次里能失败两次，报的还是「网络不通或 registry 异常」。现在手动查询单独用 10 秒超时并重试一次，后台刷新仍是 1.5 秒（它不该拖住命令）。

### 变更

- **`bean get` / `note get` 默认不再打印内嵌图片**：一条带照片的豆子 JSON 能到 130 KB 以上（照片是 `data:` URL 的 base64），在终端里既看不懂也刷屏。现在图片字段换成 `[image 95 KB（已省略，加 --with-images 输出原图）]` 占位，人读视图多一行 `Images: image 95 KB`；要原图加 `--with-images`。列表类命令本来就只投影标量字段，不受影响。
- **`bean add` 不再强制 `--roaster` / `--origin` / `--process`**：现在只有 `--name` 必填，和 App 的表单一致（它的表单里只有「咖啡豆名称」带必填星号）。以前少给一项就直接 exit 2，比 App 严 —— 一款不知道处理法的豆子根本存不进去。
- `note list` 最后一列改用 `data.timestamp`（冲煮时间，毫秒数）换算，缺失时才退回行上的 `updated_at`；以前一律显示 `updated_at`，容器里改过一条记录就看不出来原始冲煮时间了。
- `method list` 的 `1 stages` 改成 `1 stage`。

### 文档

- README 新增「常见问题」：中文 Windows 上 `--format json | ConvertFrom-Json` 报 JSON 解析错误是控制台用 GBK 解码 UTF-8 输出所致（`chcp 65001` 或 `[Console]::OutputEncoding = [Text.Encoding]::UTF8`），不是 JSON 坏了。
- 豆子的计数单位从「颗」统一改成「款」——一款豆对应一袋豆子，不是一粒。提示语、README 与 `skills/` 里的说法一起改了。
- README 加豆段补充：`--start-day` / `--end-day` 这组天数只有在**有烘焙日期**时才生效，没给 `--roast-date` 的熟豆在 App 里显示「未设置烘焙日期」，养豆期/赏味期都不计算（`flavorPeriodUtils.ts:217`）。

---

## [0.3.1] - 2026-11-05

这一版只有一个主题：让用户知道自己落后了 —— 之前检测不到更新，等于 0.2.2 之前那些会写坏数据的版本没人会升级。

### 新增

- **会提醒你用着旧版本了**：以前唯一的办法是自己想起来跑 `--version`，再跟 npm 页面比 —— 也就是说 0.2.2 之前那些会静默写坏数据的版本，用户根本不会知道自己该升级。现在每条命令结束前会看一眼本地缓存，npm 上有更新的版本就往 stderr 提醒一次（`npm install -g @fabianactor/brew-cli@latest`）。缓存 24 小时最多刷新一次，同一个版本只提示一次；**提示不联网等结果**，离线、超时、registry 报错都只是静默不提示，不影响命令本身。
- **`brew-guide update-check`**：手动查一次，总是联网、绕过缓存。`--format json` 给 `{"current","latest","upgradable","source"}`，方便脚本里判断。
- **`BREW_GUIDE_NO_UPDATE_CHECK=1`**：关掉自动检查（`update-check` 子命令本身照常工作）。

### 说明

- 缓存写在配置文件同目录的 `update-check.json`（默认 `~/.config/brew-guide/update-check.json`），可以随时删，删了下次重新查。
- `--version`、`--help`、`update-check` 自己不触发自动检查 —— 查版本的那一行不该顺带查一次网。

---

## [0.3.0] - 2026-11-05

这一版补齐「App 里能做的、CLI 做不了」，并把几处会悄悄写坏数据、或跟 App 抢写的地方堵上。

### 新增

- **`--in-transit` / `--is-frozen`**（`bean add`、`bean update`）：新建豆默认「已到手」，在途和冷冻都能直接标，取消用 `--no-in-transit` / `--no-frozen`。两个是互斥状态，开一个自动关掉另一个，同时给会报错。
- **生豆**：`--bean-state green` + `--purchase-date`。生豆记购买日期（不给就填今天），没有烘焙日期、没有赏味期；`--bean-state green` 与 `--roast-date` 冲突会直接报错。`bean update <id> --bean-state roasted` 转回熟豆。
- **`note add --bean-id` 自动写 `coffeeBeanInfo`**：存一份豆子快照（名字、烘焙度、烘焙日期、烘焙商），和 App 点「记录一杯」的行为一致；以后豆子改名，旧记录仍显示当时的样子。
- **赏味期跟随 App 里的用户设置**：`--start-day` / `--end-day` 不给时，先读 `user_settings` 里的烘焙商配置和全局自定义，再落到兜底预设（浅 7/60、中 10/60、深 14/90）。旧行为是永远只用兜底预设 —— 你在 App 里给某个烘焙商调过「浅烘 20 天」，CLI 建的豆子不认。

### 修复

- **写回时可能覆盖 App 刚改的数据**：改/删都是「先读整行、改完写回」，以前写回时不检查这行是不是还是读到的那一版，App 在中间写过一次就会被旧快照盖掉。现在按 App 自己的并发约定（`syncOperations.ts:867-878` 拿 `updated_at` 当版本号）做 compare-and-swap：版本对不上就放弃写入并提示重跑，而不是闷头覆盖。
- **`equipment add --force` 会抹掉器具的自定义图形**：以前拿同一个 id 覆盖时只写 `name/animationType/hasValve/note`，把 App 里画的 `customShapeSvg`、`customValveSvg`、`customValveOpenSvg` 全清空了。现在保留旧行里 CLI 没有开关的字段，只替换显式传的几项。
- **方法多过 1000 条时「找不到」**：`method update` / `method delete` 之前一次拉全部 `custom_methods` 行，超过 PostgREST 单次上限（常见 1000 行）的部分会静默消失。现在分页拉全量。
- **`--price` 不校验**：以前 `abc` 也照写，App 详情页算「元/克」时出 `NaN`。现在只收数字（最多两位小数），顺手容错 `¥88`、`88元`。
- **`upsertBeanRecord` 把修好的写入语义又覆盖回去**：这个工具层还留着旧兜底——没烘焙度就写「浅度烘焙」、赏味期硬填 `30/60`、有烘焙日期就把在途改成 `false`。上一版只修了命令层，实测生豆仍被写成 `startDay=30`、在途豆仍被写成已到手。现在这一层只补形状默认值（`beanType`、`beanState`、`isFrozen`），不替用户猜内容。
- **`c12` 会读当前目录的 `.env`**：以前在别的项目目录里跑，那边恰好有 `BREW_GUIDE_*` / `SUPABASE_*` 的 `.env`，就会悄悄换成另一个库。现在只读配置文件和 shell 里真正导出的环境变量。
- **命令输出里的 ID 被截成前 8 位**：`note update` 的「Updated note 17938004」、`bean update` / `bean consume` / `method update` 的 dry-run 都是截断的，拿这个 ID 回查或再操作都对不上。现在一律打完整值（列表视图里的 ID 列仍截断，那是显示宽度）。

### 计划中

- `note add` 的 `methodId`（库里的记录 0 条用到，暂不做）

## [0.2.2] - 2026-11-04

这一版只修「写进去的数据 App 里不会这么显示」和「新用户第一次用就卡住」两类问题。

### 修复 · 会写坏数据

- **新建豆默认被标成「在途」**：没有 `--roast-date` 时以前的实现会写 `isInTransit: true`，豆子卡片上就挂着在途标记。现在恒定写 `false`（与 App 缺省一致）。
- **赏味期固定 30/60 天**：改为按烘焙度取 App 的同一套预设——浅烘 `7/60`、中烘 `10/60`、深烘 `14/90`；烘焙度为空时按中烘。
- **按豆种猜烘焙度**：以前 `filter` 一律写「浅度烘焙」、`espresso` 写「中深烘焙」。现在不给就不填。猜错的值会让 `bean list --roast-level`（精确匹配）永远筛不到这款豆。
- **`--rating` 不校验范围**：`--rating 9` 以前直接入库，App 里显示 9/5。现在只收 0–5，超范围 exit 2 不写库。
- **`--water-temp "92°C"` 写出 `NaN°C`**：以前直接 `Number()`。现在接受 `92`、`92°C`、`88 ℃`、`93.5C`，统一存成 `92°C`。
- **`--stages-json` 只校验是不是数组**：现在逐段校验——`label` 必填，`detail` 缺失补空字符串，`name`→`label`、`time`→`duration` 自动兼容，`water` 数字转字符串，`duration` 必须是非负数，`valveStatus` 只能是 `open`/`closed`。

### 修复 · 新用户会卡住

- **新建器具/方法只打印前 8 位 ID**（`custom-o`）：现在打印完整 ID。以前拿不到 ID 就没法 `method add --equipment-id`。
- **`--bean-type` / `--animation-type` 不校验**：现在都校验并列出可选值（豆种 `filter/espresso/omni`，动画 `v60/kalita/origami/clever/custom/espresso`）。
- **`--equipment` 不校验存在性**：现在内置器具（V60 / CleverDripper / Kalita / Origami / Orea / Sinloy / Espresso，中文名也认）直接认并写 `equipmentId`；自定义器具查不到就报错，不再写出指不上任何器具的记录。
- **`bean list` 缺产国/批次筛选**：新增 `--country`、`--batch`。`--country` 在产国字段为空时回落到产地（按现行填写口径，国家是写在产地里的）。
- **`delete` 文案里的 ID 也被截断**：改成完整 ID。

### 变更

- `bean add` 的默认值变了：`isInTransit` 恒为 `false`，`startDay/endDay` 按烘焙度取预设。依赖旧默认值的脚本要注意。
- `--rating` 超范围、未知参数、`--bean-type`/`--animation-type` 非法值现在都 exit 2（以前是静默忽略或照写）。
- CI 改成 ubuntu / windows / macos 三平台都跑。

### 文档

- README：加豆段说明烘焙度不猜、赏味期预设；`--country`/`--batch` 进筛选示例；记一杯段写明 rating 范围、水温写法、器具校验；安装段补 macOS `EACCES` 的解法（nvm 或 `--prefix ~/.npm-global`）。
- 删掉 README 里「批次字段暂未适配」这条过期限制——批次写在 `blendComponents[0].batch`，App 勾了批次就能看到。
- `skills/brew-guide/` 三个 reference 同步更新。

### 升级

```bash
npm install -g @fabianactor/brew-cli@0.2.2
```

这次没有数据结构变更，不用重新跑 `init`，也不用迁移库。

### 旧数据要不要管

`bean list --format json` 的摘要里就带 `isInTransit`、`startDay`、`endDay`，可以直接查（库小的时候最省事）：

```powershell
# 被旧版本误标成在途的豆子
brew-guide bean list --limit 200 --format json | ConvertFrom-Json |
  Where-Object { $_.isInTransit } | Select-Object name

# 赏味期还是旧默认值 30 的豆子
brew-guide bean list --limit 200 --format json | ConvertFrom-Json |
  Where-Object { $_.startDay -eq 30 } | Select-Object name, startDay, endDay
```

macOS / Linux 上用 `jq`：`brew-guide bean list --limit 200 --format json | jq -r '.[] | select(.isInTransit) | .name'`

两条都为空就说明旧版本没往库里写坏东西。真要改，`bean update <id> --start-day 7 --end-day 60` 能补上；在途标记目前只能在 App 里改。

**评分和水温**那两个 bug 不写坏结构，写进去的是 `9` 这种越界分值、`"NaN°C"` 这种字符串——翻一下最近几杯就知道有没有中，中了用 `note update <id> --rating 4 --water-temp 92` 覆盖即可。

## [0.2.1] - 2026-11-04

只有发布流程，命令行为与 0.2.0 一致。

- 发版改为 **npm trusted publishing（OIDC）**：推 `v*` tag 触发 CI 发布，带 provenance，不再需要 `NPM_TOKEN`。
- 包名确认为 `@fabianactor/brew-cli`（无作用域的 `brew-cli` 在 npm 上是永久锁死的墓碑名）。
- LICENSE 恢复上游原文（两行 copyright 连排会让 GitHub 识别不出 MIT），改动归属单独写进 `NOTICE`。

## [0.2.0] - 2026-11-04

第一个自己发布的版本。相对上游 0.1.10 的主要变化：

### 新增

- **成分字段与多成分拼配**：`bean add/update` 支持 `--country / --region / --estate / --processing-station / --altitude / --batch / --percentage`，以及可重复的 `--component "origin=…;region=…;percentage=33"`。旧版只有 `--origin / --estate / --process / --variety` 四个，产区和处理站根本传不进去。
- **`--component-index`**：`bean update` 可以只改某个成分的字段，或用 `--component` 整组替换。
- **列表筛选下推到 Supabase**：`bean list` / `note list` 不再「先取 limit 条再在本地筛」，改成 sql 层过滤 + 分页扫描，加了 `--region / --process / --variety / --roaster`；`note list` 加 `--from / --to`。
- **`backup` 命令**：整库导出五张表到一个 JSON 文件（默认含软删记录），批量写库前的保险。
- **`roasters` 自助修复**：库里没有 `public.get_all_roasters()` 时不再 404 就完事，直接把建函数的 SQL 打出来。
- **退出码规范化**：`0` 成功、`1` 失败、`2` 用法错误、`64` 配置缺失、`65` 网络/远端错误。输出也统一成「数据走 stdout，诊断走 stderr」，`--format json` 一律单行紧凑。

### 优化

- 八个 get/delete 命令抽出 `createGetCommand` / `createDeleteCommand` 工厂，去掉重复流程（`src/lib/crudCommands.ts`）。
- `--id` 撞到已有器具不再静默覆盖，要加 `--force` 才替换。
- 所有命令统一做未知参数校验：拼错的 flag 现在直接报错并列出可用参数，以前是静默吞掉（`bean update --bean-type` 这种参数就是这么被吃掉的）。
- 写库前校验引用存在性：`note add --bean-id`、`method add --equipment-id`。
- 软删记录被重写会复活这一行为写进了文档；`data` 里的时间值统一为毫秒数。

### 修复

- Windows 上每次运行都误报 `config file has insecure permissions`；`init` 的 `chmod 0600` 在 Windows 上是空操作；`build` 因 `chmod +x` 报错。
- 配置字段 `supabaseServiceRoleKey` 改名 `supabaseKey`——它其实一直是 publishable/anon key，旧名字会让人以为能绕过 RLS。旧字段仍可读，只在 stderr 提示一次改名。
- 新建器具/方法的 id 与时间戳格式统一（`method-<ms>-<7位>`，时间戳为毫秒数）。
- `note update` 不再自己造 `updatedAt`（表上已有 `updated_at`）。
- `init` 输入密钥时不再明文回显；`commands.log` 超过 1 MB 自动轮转，参数值超长会截断。
- 配置里的 URL 结尾带 `/` 不再拼出 `//rest/v1`。

### 破坏性变更

- 未知参数、非法取值、空字符串覆盖必填字段现在都报错退出，不再静默忽略。
- `equipment add --id <已存在>` 不再覆盖，需要 `--force`。
- `--origin`、`--process` 从「必填参数」变成「成分级校验」：只要有一个成分带产地或处理法即可，`--component` 也能满足。
- 输出格式调整：JSON 单行紧凑、诊断信息走 stderr。抓 stdout 解析 JSON 的脚本需要相应调整。

---

[未发布]: https://github.com/FabianActor/brew-cli/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/FabianActor/brew-cli/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/FabianActor/brew-cli/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/FabianActor/brew-cli/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/FabianActor/brew-cli/compare/8133a4a...v0.2.1
[0.2.0]: https://www.npmjs.com/package/@fabianactor/brew-cli/v/0.2.0
