# 更新日志

本文件记录 `@fabianactor/brew-cli` 的变更。0.2.0 之前的版本属于上游 [swiftwind0405/brew-guide-cli](https://github.com/swiftwind0405/brew-guide-cli)，本仓库从 0.2.0 起独立维护，之前的历史请直接看那个仓库。

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)，分类参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

**升级**：`npm install -g @fabianactor/brew-cli@latest`
**回滚**：`npm install -g @fabianactor/brew-cli@<版本号>`
**查当前版本**：`brew-guide --version`

---

## [未发布]

计划中、还没动的部分（等你决定优先级）：

- `bean add --in-transit` 标记在途豆（现在一律写 `isInTransit: false`，只能在 App 里改）
- 生豆支持：`--bean-state green` 与购买日期语义（现在固定 `roasted`）
- `--price` 格式校验
- `--is-frozen`（现在固定 `false`）
- `note add` 补写 `methodId` / `coffeeBeanInfo`（现在只写 `equipmentId`）
- 不让 `c12` 读当前目录的 `.env`（配置文件以外的环境变量来源应显式）

## [0.2.2] - 2026-11-04

这一版只修「写进去的数据 App 里不会这么显示」和「新用户第一次用就卡住」两类问题。

### 修复 · 会写坏数据

- **新建豆默认被标成「在途」**：没有 `--roast-date` 时以前的实现会写 `isInTransit: true`，豆子卡片上就挂着在途标记。现在恒定写 `false`（与 App 缺省一致）。
- **赏味期固定 30/60 天**：改为按烘焙度取 App 的同一套预设——浅烘 `7/60`、中烘 `10/60`、深烘 `14/90`；烘焙度为空时按中烘。
- **按豆种猜烘焙度**：以前 `filter` 一律写「浅度烘焙」、`espresso` 写「中深烘焙」。现在不给就不填。猜错的值会让 `bean list --roast-level`（精确匹配）永远筛不到这颗豆。
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

这次没有数据结构变更，不用重新跑 `init`，也不用迁移库。老数据里如果有 `isInTransit: true`、`startDay: 30` 的豆子，值得自己在 App 里看一眼是不是真想要这个值。

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
