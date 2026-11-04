# Method Add Workflow

新增冲煮方案的完整规则。执行 `brew-guide method add` 前阅读。

冲煮方案属于某个器具，新增前需要先知道 `equipment-id`。

## 1. 字段清单

**必填**
- `--equipment-id`
- `--name`

**推荐填写**
- `--coffee`（如 `20g`）
- `--water`（如 `300g`）
- `--ratio`（如 `1:15`）
- `--grind-size`（如 `Comandante 24 clicks`）
- `--temp`（如 `93`）
- `--stages-json`：分段注水步骤，见下文

## 2. 查 equipment-id

不确定时先查：

```bash
brew-guide equipment list --format json
```

### 经验补充（很重要）

- `brew-guide method` 的 `equipment-id` 当前实际上是一个**自由字符串键**；即使 `equipment list` 为空，也仍然可以直接用任意字符串创建方案。
- `method list` 返回的 `_equipmentId` 就是实际挂载的器具键；应用是否能显示，取决于这个键是否和应用内置设备键一致，而不只是中文展示名一致。
- 已验证的应用默认的设备映射：
  - `V60` → `V60`
  - `蛋糕滤杯` → `Kalita`
  - `折纸滤杯` → `Origami`
  - `聪明杯` → `CleverDripper`
  - `咖啡机` → `Espresso`
- 因此：`equipment list` 主要用于探测现有命名；**不能**因为它为空就断定 method 不能新增。对内置设备，优先复用已验证的 `_equipmentId`，不要直接拿 UI 中文名当 key。

## 3. stages-json Schema

必须是合法 JSON **数组**，每个元素是一个 stage：

```jsonc
[
  {
    "label": "闷蒸",           // 必填，步骤名
    "pourType": "center",      // 必填，注水方式
    "water": "60",             // 本段水量（`pourType=wait` 可省；其他注水步骤通常应填）
    "duration": 30,             // 推荐；有明确时间时填写
    "detail": ""               // 可选
  }
]
```

### 实际兼容性说明

- `--stages-json` 现在会逐段校验（`src/lib/noteInput.ts` 的 `parseStages`）：每段必须有 `label`，`detail` 缺了补空字符串，`name` → `label`、`time` → `duration` 自动兼容，`water` 数字会转成字符串，`duration` 必须是有限非负数，`valveStatus` 只能是 `open` / `closed`。缺 `label` 直接 exit 2 并指出是第几段。
- 非 `wait` 步骤没有 `duration` 仍然可以写入。
- 所以，图片只给了总时长、阶段结束点或只给了注水量时，可以：
  - 对有明确时间点的 stage 写 `duration`
  - 对没有明确单段时长的 stage **省略 `duration`**，不要硬猜
- `water` 字段既可存单段水量，也可存“补到总量/剩余至 180-190g”这类文字，只要这是用户想保留的原始方案表达。

### pourType 可选值

- `center`：中心注水
- `circle`：绕圈注水
- `ice`：冰块
- `bypass`：bypass/兑水
- `wait`：等待/焖蒸静置（不输出 water）
- `other`：其他/自定义
- `extraction`：意式萃取（已用 `brew-guide method add --dry-run` 验证可写入）

### 额外 stage 字段

- `stages-json` 当前也会透传未在文档主 schema 中强调的附加字段。
- 已用 `brew-guide method add --dry-run` 验证：聪明杯步骤可附带 `"valveStatus":"closed"` 这类字段，写法示例：

```json
[
  {
    "label": "[关阀]焖蒸(绕圈注水)",
    "water": "30",
    "detail": "中心向外绕圈，确保均匀萃取",
    "duration": 10,
    "pourType": "circle",
    "valveStatus": "closed"
  },
  {
    "label": "等待",
    "detail": "",
    "duration": 20,
    "pourType": "wait"
  }
]
```

- 这类附加字段应尽量只在用户明确提供、或需要对齐应用内置设备行为时使用；不要凭空发明字段名。

### 常见模式

**四六法（20g / 300g）**

```json
[
  {"label":"第一段 甜度","pourType":"center","water":"60","duration":10},
  {"label":"第一段 甜度","pourType":"circle","water":"120","duration":35},
  {"label":"第二段 酸质","pourType":"circle","water":"180","duration":20},
  {"label":"第三段 强度","pourType":"circle","water":"240","duration":20},
  {"label":"第四段 强度","pourType":"circle","water":"300","duration":20}
]
```

**V60 三段式**

```json
[
  {"label":"闷蒸","pourType":"center","water":"30","duration":30},
  {"label":"第二注","pourType":"circle","water":"150","duration":30},
  {"label":"第三注","pourType":"circle","water":"225","duration":30}
]
```

## 4. 先 dry-run

```bash
brew-guide method add \
  --equipment-id "equip_xxx" \
  --name "四六法" \
  --coffee "20g" \
  --water "300g" \
  --ratio "1:15" \
  --grind-size "Comandante 24 clicks" \
  --temp "93" \
  --stages-json '[{"label":"闷蒸","pourType":"center","water":"60","duration":30},{"label":"第二注","pourType":"circle","water":"60","duration":15}]' \
  --dry-run
```

## 5. 查询与管理

```bash
brew-guide method list --format json
brew-guide method list --equipment-id "equip_xxx" --format json
brew-guide method get <id> --format json
brew-guide method update <id> --name "改良四六法" --dry-run
brew-guide method delete <id> --dry-run
```

> `method update` 当前**只支持 `--name`**，不能改 `params / stages / equipment-id`。
>
> 需要改参数只能 `delete` 后重新 `add`；需要**改挂载器具**时，正确流程是：
> 1. 用新的 `equipment-id` 先 `method add --dry-run`
> 2. 正式 `method add`
> 3. 验证 `method get / method list`
> 4. 再删除旧 method
>
> `method delete` 是**硬删除**，执行前务必 dry-run 确认 ID。

## 6. 从图片提取方案（OCR）

用户给图片时，按下方提示词严格抽取 JSON，再映射到 CLI flags。只取图中明确可见文字，**不编造不脑补**。

### 角色

严格的咖啡冲煮方案 OCR 与结构化抽取工具。输出 1 个 JSON object，不要 markdown/解释/代码块/额外文本。

### 输出格式

```json
{
  "name": "方案名",
  "params": {
    "coffee": "15g",
    "water": "225g",
    "ratio": "1:15",
    "grindSize": "C40 MK3 #24",
    "temp": "91°C",
    "stages": [
      {
        "pourType": "center|circle|ice|bypass|wait|other",
        "label": "步骤名",
        "water": "30",
        "duration": 5,
        "detail": "绕圈注水"
      }
    ]
  }
}
```

### 字段规则

1. 顶层必输 `name` + `params`
2. `params.stages` 数组，按时间顺序
3. 顶层字段保留单位：`coffee "15g"` / `water "225g"` / `ratio "1:15"` / `grindSize` 原文 / `temp "91°C"`
4. `stage.water` 纯数字字符串，无单位（如 `"30"`）
5. `stage.duration` 整数秒
6. wait 步骤：`pourType="wait"`，`label="等待"`，有 `duration`，不输出 `water`，`detail=""`
7. 非 wait 步骤尽量输出 `label/duration/detail`；`water` 仅图片明确注水量时输出

### 识别原则

1. 只提取明确可见信息，不编造
2. 无明确方案名 → 用图中最显标题或器具名，不自创花哨名
3. 同图只输 1 个最完整方案
4. `detail` 保原意，不加新信息
5. `coffee/water/ratio` 图中未明确写 → 空字符串 `""`，不猜
6. 阶段水量/累计水量/液重/bypass 水量 **不能**当 `coffee`
7. 只有图片明写"粉量/coffee dose"才填 `coffee`
8. 只有图片明写"总水量/总注水量/water"才填 `params.water`
9. `ratio` 需图片明写，或顶层同时有"粉量+总水量"才可推算

### 注水类型映射

- 中心注水 → `center`
- 绕圈/画圈/螺旋 → `circle`
- 加冰/冰块 → `ice`
- bypass/兑水 → `bypass`
- 焖蒸后静置/浸泡等待 → `wait`
- 同步骤两种注水动作无法拆分（如"绕圈后回到中心"）→ `other`，原说明放 `detail`

### 时间处理

1. 行首时间/时间区间 + 同行克数（如 `"0"-7" 40g"`）= 注水步骤，非 wait
2. 首条区间从 0 秒起 → 第一步必为注水，前面不生成 wait
3. 区间格式支持：`0:20-0:40` / `00:20 - 00:40` / `35"-1'00"`，先转秒再求 duration
4. `duration = 结束 - 开始`。例 `0:50-1:02` → 12 秒，**不是** 62 秒
5. 当前步结束 < 下一步开始 → 中间插 wait，`duration = 下一步开始 - 当前步结束`
6. 间隔 ≤ 0 不生成 wait
7. "焖蒸 30 秒，注水 10 秒，50g" 拆成：注水步（duration=10, water="50"）+ wait（duration=20）

### 水量处理

1. 先判"单段"还是"累计"
2. 水量随时间递增且末段 = 总水量 → 累计
3. 累计 → 输出时转增量：首段原值，后续 `water = 当前累计 - 上段累计`
4. 例：总 225g，标 30/150/225 → 输出 30/120/75
5. 无法判断则保守，不编造差分
6. "时间区间+克数列表"形式默认视为累计注水量

### Few-shot 示例

**示例 1**：锥形滤杯，15g/225g/91°C/C40 MK3 #24；0:00-0:05 绕圈 30g；0:20-0:40 绕圈后回中心 150g（累计）；0:50-1:02 中心 225g（累计）

```json
{
  "name": "锥形滤杯",
  "params": {
    "coffee": "15g",
    "water": "225g",
    "ratio": "1:15",
    "grindSize": "C40 MK3 #24",
    "temp": "91°C",
    "stages": [
      {"pourType":"circle","label":"第一段","water":"30","duration":5,"detail":"绕圈注水"},
      {"pourType":"wait","label":"等待","duration":15,"detail":""},
      {"pourType":"other","label":"第二段","water":"120","duration":20,"detail":"绕圈注水后回到中心注水"},
      {"pourType":"wait","label":"等待","duration":10,"detail":""},
      {"pourType":"center","label":"第三段","water":"75","duration":12,"detail":"中心注水"}
    ]
  }
}
```

**示例 2**：Thiriku washed(AA)，95°C，C40 #22格；`0"-7" 40g` / `35"-1'00" 155g` / `1'35"-1'50" 255g` / bypass；无明确粉量与总水量字段名

```json
{
  "name": "Thiriku washed(AA)",
  "params": {
    "coffee": "",
    "water": "",
    "ratio": "",
    "grindSize": "C40 #22格",
    "temp": "95°C",
    "stages": [
      {"pourType":"circle","label":"第一段","water":"40","duration":7,"detail":""},
      {"pourType":"wait","label":"等待","duration":28,"detail":""},
      {"pourType":"circle","label":"第二段","water":"115","duration":25,"detail":""},
      {"pourType":"wait","label":"等待","duration":35,"detail":""},
      {"pourType":"circle","label":"第三段","water":"100","duration":15,"detail":""},
      {"pourType":"bypass","label":"Bypass","detail":"bypass"}
    ]
  }
}
```

### 映射到 CLI

OCR JSON 抽出后按 `params` 各字段填入对应 flag，`stages` 整体塞 `--stages-json`。先 `--dry-run` 验证再提交。

## Anti-Patterns

- ❌ 不要不关联 `equipment-id` 就新增方案
- ❌ 不要跳过 dry-run
- ❌ `--stages-json` 必须是合法 JSON 数组。注水步骤含 `label / pourType / water / duration`；`wait` 步骤含 `label / pourType / duration`（无 water）
- ❌ 不要在 `pourType` 里写中文或自定义字符串，只用枚举值
