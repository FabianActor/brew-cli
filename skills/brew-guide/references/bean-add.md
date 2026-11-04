# Bean Add Workflow

新增咖啡豆的完整规则。执行 `brew-guide bean add` 前阅读。

## 1. 字段清单

**必填**
- `name`
- `roaster`
- `origin`
- `process`

**推荐填写**
- `estate`
- `variety`
- `roastDate`
- `capacity`
- `beanType`

**可选**
- `roastLevel`
- `price`
- `flavor`
- `notes`

> `startDay / endDay` CLI 不支持 flag 传参，新增时固定 `30 / 60`。

## 1.5 字段拆分口径（Fabian 定，2026-11-04）

烘焙商标签上那串"产地"其实是好几层东西，一律按下表拆开填，**不要整段塞进 origin**。

| 字段 | 放什么 | 例子 |
|---|---|---|
| `origin` 产地 | **国家**。产国字段是关闭的，国家只能落在这里 | `埃塞俄比亚`、`中国云南`、`巴布亚新几内亚` |
| `region` 产区 | 大区 + 细分，空格连接，不写成两级 | `古吉 罕贝拉`、`西达摩 班莎`、`耶加雪菲`、`保山龙陵`、`涅里` |
| `estate` 庄园 | 处理厂 / 合作社 / 农场 / 庄园名 | `奇拉卡`、`Buku Abel`、`Gedeb Danche`、`楠迪庄园`、`加恰莎` |
| `processingStation` 处理站 | **只有标签明写"处理站"时才填**，站名或站主 | `Yaye-Testi`、`Faysel Abdosh`、`希尔达` |
| `process` 处理法 | 原样照抄，不要归并成大类 | `厌氧日晒`、`浸没冷发酵水洗`、`三重发酵水洗`、`水洗/日晒` |
| `variety` 品种 | 只放品种；同成分多品种用 `" / "` 连 | `74110 / 74112`、`卡蒂姆`、`原生种`、`SL28 / SL34` |
| 等级 `G1` / `AA` / `Supremo` | **不进任何字段**，只保留在豆名里 | 豆名写 `埃塞 耶加雪菲 果丁丁 水洗G1`，字段不写 G1 |
| 海拔 `1920-2020m` | 海拔字段关闭，写进 `notes` 一行 `海拔：1920-2020m` | — |
| 产国 `country` | 关闭。国家已经在 `origin` 里，两处都有就是重复 | — |

补充规则：

- **大区与细分不拆两栏**：`古吉` + `罕贝拉` 合成 `古吉 罕贝拉` 放 `region`，不要再往下拆。
- **别把产区填进庄园**：`耶加雪菲`、`西达摩`、`布果尼` 这类是产区；庄园栏只放具体厂/合作社名。
- **处理站 vs 庄园**：注意站和庄园是两回事；拿不准就填庄园，处理站留空。
- **拼配多成分**：每个成分单独一组，各自带 `percentage`；只有品种/处理法不同的"多个成分"要合并成一条（`variety` 用 ` / ` 连），不要当成两颗豆。
- **物种不是品种**：`阿拉比卡` 是物种，云南的卡蒂姆就写 `卡蒂姆`。

## 2. 烘焙商先匹配

识别出烘焙商后，先跑：

```bash
brew-guide roasters --format json
```

匹配规则：
- 忽略大小写、空格和常见后缀
- 命中已有烘焙商时，用系统里的规范名字
- 没命中就保留原始名字

## 3. 给用户看提取结果

用自然语言展示，不要一上来像表单审讯。先展示已有内容，再只补问关键缺失项。

示例：

```text
我识别到这些信息：
- 名称：秘鲁 美景庄园 SL-09 水洗
- 烘焙商：Finish Line Coffee
- 产地：秘鲁 卡哈马卡大区
- 庄园：VISTA ALEGRE
- 处理法：水洗
- 品种：SL-09
- 规格：150G
- 海拔：1920M

还缺：烘焙日期
```

## 4. 默认值规则

- `beanType` 没给时，默认按 `filter`
- `beanType = filter` 且没给 `roastLevel` 时，默认 `浅度烘焙`
- `beanType = espresso` 且没给 `roastLevel` 时，默认 `中深烘焙`
- `startDay / endDay` CLI 固定 `30 / 60`，无 flag 可覆盖

## 5. 在途豆规则

- 如果豆子还没收到，可以直接新增
- 在途豆允许没有 `roastDate`
- 没有 `roastDate` 时，按在途豆处理
- agent 不要因为缺少 `roastDate` 就阻止创建
- 但仍要尽量收集 `name / roaster / origin / process`

在途豆示例：

```text
这包豆子还在路上，还没有烘焙日期。
这种情况可以直接建档，不用等收货后再录。
```

## 6. 烘焙度可选值

只使用这几个值：

- `极浅烘焙`
- `浅度烘焙`
- `中浅烘焙`
- `中度烘焙`
- `中深烘焙`
- `深度烘焙`

## 7. 备注归类

`notes` 只放真正的补充备注，不要把已经有结构化字段承载的信息或整段 OCR 描述塞进备注。

**不要放进 `notes`：**

- 名称、烘焙商、产地、庄园、处理法、品种、容量、价格、风味、烘焙度等已有字段
- 商品库存、团购状态、购买人数等购买页状态
- 长段商品介绍/OCR 原文
- 为了“保存信息”而重复记录的海拔、采收时间、处理站等结构化产地信息

**例外（字段关闭时的落法）**：`海拔`、`批次` 字段当前是关闭的，这两类信息写成**固定标签行**放进 `notes`，方便以后一键搬进字段：

```text
海拔：1920-2020m
批次：2026-03 定制批次
```

处理站能填字段就填字段，不要再在备注里写一遍。

**可以放进 `notes` 的例子：**

- SCA/COE 等评分（当前无专门字段时）
- 批次特殊说明：如“beanlink 定制处理批次”
- 处理法中无法结构化表达的关键补充：如“干式发酵蜜处理，预发酵 20h”
- 明确的冲煮建议或养豆建议
- OCR 明显 typo/不确定信息的简短说明（仅当保留它有实际价值）

原则：如果删掉 `notes` 后，豆子核心信息仍完整，就不要写备注；宁可留空。

## 8. 先 dry-run，再正式写

```bash
brew-guide bean add \
  --name "秘鲁 美景庄园 SL-09 水洗" \
  --roaster "Finish Line Coffee" \
  --origin "秘鲁 卡哈马卡大区" \
  --process "水洗" \
  --estate "VISTA ALEGRE" \
  --variety "SL-09" \
  --roast-level "浅度烘焙" \
  --roast-date "2026-03-20" \
  --price "55" \
  --capacity "150G" \
  --bean-type "filter" \
  --flavor "清晰花香,橙子,水果茶,柑橘酸质" \
  --notes "COE评分：88分" \
  --dry-run
```

用户确认后，再去掉 `--dry-run` 正式写入。

## 9. 更新与消耗

更新豆子字段（支持 `--name / --roaster / --roast-level / --capacity / --remaining / --price / --notes`）：

```bash
brew-guide bean update <id> --remaining "120" --dry-run
```

扣减余量（每次冲煮后自动扣减）：

```bash
brew-guide bean consume <id> --amount 15 --dry-run
```

## 10. 从图片提取（OCR）

用户给图片时按此规则抽取，再映射 CLI flags。**只取明确可见信息，不编造**。

### 角色

OCR 工具。直接返回 JSON：单豆 `{}`，多豆 `[]`。无 markdown/解释。

### 字段

**必填**
- `name`：豆名（如 `"埃塞俄比亚赏花日晒原生种"`）

**可选**（图中明确才填）
- `roaster`：烘焙商/品牌（如 `"西可"`）
- `capacity` / `price`：纯数字，无单位
- `remaining`：纯数字，无单位（**仅 `bean update` 用，`bean add` 时 `remaining` 自动等于 `capacity`**）
- `roastDate`：`YYYY-MM-DD`，缺年份补 `2026`
- `roastLevel`：`极浅烘焙|浅度烘焙|中浅烘焙|中度烘焙|中深烘焙|深度烘焙`
- `beanType`：`filter|espresso|omni`
  - ≤200g / 浅烘 / 单品 → `filter`
  - ≥300g / 深烘 / 拼配 → `espresso`
  - 标注全能 → `omni`
  - 默认 `filter`
- `flavor`：数组 `["橘子","荔枝"]`
- `startDay` / `endDay`：养豆期/赏味期天数
- `blendComponents`：产地/庄园/处理法/品种
  ```json
  [{"origin":"埃塞俄比亚","estate":"赏花","process":"日晒","variety":"原生种"}]
  ```
- `notes`：处理站/海拔/批次号等补充。**产地和庄园放 `blendComponents`，此处只放补充**

### 规则

- 数值不带单位
- 不编造、不确定不填
- 直接返回 JSON

### 映射到 CLI

OCR JSON → flags：
- `blendComponents[0].origin/estate/process/variety` → `--origin/--estate/--process/--variety`
- `flavor` 数组 → `--flavor "a,b,c"`（逗号拼接）
- 多豆数组 → 每豆分别 `bean add`
- `startDay / endDay` 抽到也无法传入（CLI 无对应 flag），需要时事后 `bean update` 不支持，直接忽略或写入 `notes`
- `remaining` 抽到且与 `capacity` 不等 → `bean add` 后再 `bean update <id> --remaining "X"`

拼配豆（多个 `blendComponents`）当前 CLI 仅单组产地/处理/品种，其余成分写入 `--notes`。

## Anti-Patterns

- ❌ 不要只写名字和备注
- ❌ 不要跳过 roaster matching
- ❌ 不要跳过 dry-run
- ❌ 不要缺少 `name / roaster / origin / process` 就直接提交
