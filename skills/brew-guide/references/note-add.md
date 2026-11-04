# Note Add Workflow

新增冲煮记录的完整规则。执行 `brew-guide note add` 前阅读。

## 1. CLI 字段清单（向后兼容，自动转换到真实形状）

必填：

- `--bean-id`
- `--method`

**真实字段（优先使用）**：

- `--equipment <id>` → `data.equipment` + `data.equipmentId`（内置器具 `V60`、`CleverDripper`、`Kalita`、`Origami`、`Orea`、`Sinloy`、`Espresso` 直接认，中文名如「聪明杯」也认；自定义器具必须是 `equipment list` 里的 ID，查不到直接 exit 2）
- `--rating 0-5`      → `data.rating`（接受 `3.5` 这类小数，压过 `--score/20`；只收 0–5，`--rating 9` 会直接报错，不写库）
- `--source <tag>`   → `data.source`（例 `capacity-adjustment`、`quick-decrement`）
- `--notes "..."`    → `data.notes`（`--memo` / `--flavor` 也会合并进同一字段）
- `--total-time 150` → `data.totalTime`（秒，压过 `--brew-time`）
- `--taste-body / --taste-acidity / --taste-sweetness / --taste-bitterness` 0–5 → `data.taste.{body,acidity,sweetness,bitterness}`

**老字段（向后兼容，自动转换到真实形状）**：

- `--grind-size`  → `params.grindSize`
- `--water-temp`  → `params.temp`（统一写成 `92°C`；接受 `92`、`92°C`、`88 ℃`、`93.5C` 这些写法，写不出数字就报错，不再出现 `NaN°C`）
- `--ratio`       → `params.ratio`
- `--coffee 15g`  → `params.coffee`（粉量原文照存，不换算）
- `--water 225g`  → `params.water`（水量原文照存，不换算）
- `--brew-time`   → `totalTime`（秒；支持 `"2:30"` 或纯数字）
- `--flavor`      → 合并进 `notes`
- `--score`（0–100） → `rating`（/20 → 0–5）
- `--memo`        → `notes`
- `--brewed-at`（ISO） → `timestamp`（unix ms）

真实表字段完整形状（`brew_guide_upsert_note` 工具也直接接受这些）：

- `rating` (0–5，可小数)
- `taste` (`{body, acidity, sweetness, bitterness}` 0–5 每项)
- `notes`, `timestamp`, `totalTime`, `source`
- `params.{temp, ratio, water, coffee, grindSize, stages}`
- `equipment`（equipment 行 ID）
- `coffeeBeanInfo`

## 2. 查 beanId

不知道 `beanId` 时先查：

```bash
brew-guide bean list --format json --limit 20
```

从结果中选中目标豆子的 `id`。

## 3. 先给用户看草稿

用自然语言说明现在准备写什么、缺什么，避免像表单审讯。

## 4. 先 dry-run

优先走真实字段：

```bash
brew-guide note add \
  --bean-id "bean_xxx" \
  --method "V60" \
  --equipment "V60" \
  --rating 4 \
  --notes "柑橘酸很明亮，花香明显；后段更甜，下次再细一点" \
  --total-time 150 \
  --ratio "1:15" \
  --grind-size "Comandante 24 clicks" \
  --water-temp 92 \
  --dry-run
```

或用老字段（等价，转换发生在 `executeUpsertNote`）：

```bash
brew-guide note add \
  --bean-id "bean_xxx" \
  --method "V60" \
  --grind-size "Comandante 24 clicks" \
  --water-temp 92 \
  --ratio "1:15" \
  --brew-time "2:30" \
  --flavor "柑橘酸很明亮，花香明显" \
  --score 85 \
  --memo "后段更甜，下次可以再细一点" \
  --dry-run
```

确认后再去掉 `--dry-run` 正式写入。

## 5. 扣减豆子余量

记完冲煮通常要顺手扣减对应豆子余量：

```bash
brew-guide bean consume <bean-id> --amount 15 --dry-run
```

## 6. 更新冲煮记录

支持更新 `--rating`（0–5）、`--method`、`--notes/--memo`，以及 `--coffee/--water/--ratio/--grind-size/--water-temp` 这组成分参数（会合并进同一个 `params`，只覆盖你传的那几项）：

```bash
brew-guide note update <id> --rating 4 --memo "回甘更好" --dry-run
```

## 7. 参数拼错会直接报错

`note add` / `note update` 在 run() 开头校验参数名：写了没声明的 flag（比如把 `--coffee` 拼成 `--coffe`）会 `exit 2` 并列出可用参数，不再静默忽略。

## Anti-Patterns

- ❌ 不要不关联 `bean-id` 就直接记冲煮
- ❌ 不要跳过 dry-run
- ❌ `--score` 范围 0–100；`--rating` 范围 0–5。不要混用
- ❌ 不要自己拼 `params` JSON —— 用 `--coffee/--water/--ratio/--water-temp/--grind-size` 扁平参数即可
