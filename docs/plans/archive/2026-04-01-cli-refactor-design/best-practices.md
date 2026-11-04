# 最佳实践

## 输出格式规范

### 默认（人类可读）

```
Created bean bean_abc123 at 2026-04-01T10:30:00.000Z
Created note note_xyz789 at 2026-04-01T10:30:00.000Z
[dry-run] Would create bean:
{ "name": "...", "roaster": "...", ... }
```

### JSON 模式（`--format json`）

所有命令支持 `--format json`，Skill 使用此模式获取结构化输出：

```json
// bean add / note add 成功
{ "id": "bean_abc123", "status": "created", "timestamp": "2026-04-01T10:30:00.000Z" }

// bean add / note add dry-run
{ "dryRun": true, "bean": { "name": "...", "roaster": "..." } }

// bean list / note list
[{ "id": "bean_abc123", "name": "...", "roaster": "...", "updatedAt": "..." }]
```

**规则**：JSON 模式下 stdout 只输出 JSON，所有警告/错误走 stderr。

---

## 退出码规范

| 代码 | 含义 | 场景 |
|---|---|---|
| `0` | 成功 | 正常执行完成 |
| `1` | 通用错误 | 验证失败、Supabase 错误 |
| `2` | 用法错误 | 缺少必填参数、未知命令 |
| `64` | 配置错误 | 缺少凭证，提示运行 `brew-guide init` |
| `65` | 网络错误 | 连接超时、HTTP 5xx |
| `126` | 认证错误 | Supabase service role key 无效 |
| `130` | 用户中断 | Ctrl+C (SIGINT) |

---

## 错误输出规范

所有错误写 **stderr**，格式：`Error: <Category> - <Message>`

```bash
# 配置缺失
Error: Config - Missing Supabase credentials
Hint: Run 'brew-guide init' or set BREW_GUIDE_SUPABASE_URL

# 网络错误
Error: Network - Connection timeout to Supabase
Hint: Check your connection and try again

# 认证失败
Error: Auth - Invalid Supabase service role key
Hint: Run 'brew-guide init' to reconfigure credentials

# 参数缺失
Error: Missing required arguments: --origin, --process

# 数据超限
Error: Bean data exceeds 64 KB limit
Hint: Reduce the size of --notes or other fields
```

**禁止**：不向用户暴露 stack trace，不在错误信息中泄露 service role key。

---

## 安全实践

### Service Role Key 存储

- `~/.config/brew-guide/config.json` 权限必须为 `600`（仅所有者可读写）
- `init` 命令写文件时使用 `{ mode: 0o600 }`
- 启动时检查文件权限，若为 `644` 或更宽松则打印警告（不阻断执行）

```typescript
import { stat } from 'node:fs/promises'

async function checkConfigPermissions(configPath: string) {
  const s = await stat(configPath)
  const mode = s.mode & 0o777
  if (mode & 0o044) { // 组或其他用户可读
    console.error(`Warning: config file has insecure permissions (${mode.toString(8)}, expected 600)`)
  }
}
```

### Key 脱敏

日志中输出 service role key 时只显示首尾 4 字符：

```typescript
function maskKey(key: string): string {
  if (key.length <= 8) return '***'
  return `${key.slice(0, 4)}***${key.slice(-4)}`
}
```

### HTTPS 强制

```typescript
if (!supabaseUrl.startsWith('https://')) {
  throw new Error('Config - Supabase URL must use HTTPS')
}
```

---

## Dry Run 实现要求

- `--dry-run` 在解析完参数、构建好数据对象后立即返回，**不调用** `resolveConfig()`，**不创建** Supabase 客户端
- Dry run 输出与正常输出格式相同（支持 `--format json`），但包含 `dryRun: true` 标记
- Dry run 在网络不可用、配置缺失时仍应成功（退出码 0）
- Dry run 不写入任何数据，不产生任何 Supabase 副作用

---

## 参数类型处理

Citty 没有内置 `number` 类型，需在命令 `run` 函数中手动转换：

```typescript
const waterTemp = args['water-temp'] ? Number(args['water-temp']) : undefined
const score = args.score ? Number(args.score) : undefined
const limit = args.limit ? Math.max(1, parseInt(args.limit, 10)) : 20

// 验证
if (args.limit && isNaN(limit)) {
  console.error('Error: --limit must be a positive integer')
  process.exit(2)
}
```

---

## flavor 字段处理

CLI 接收逗号分隔字符串，内部转为数组：

```typescript
const flavor = args.flavor
  ? args.flavor.split(',').map((f: string) => f.trim()).filter(Boolean)
  : undefined
```

示例：`--flavor "清晰花香,橙子,柑橘酸质"` → `["清晰花香", "橙子", "柑橘酸质"]`

---

## 测试策略

### 单元测试（复用现有）

现有 `tests/*.test.mjs` 测试 execute 函数，无需修改（这些函数不变）。

### CLI 集成测试（新增）

使用 `node:child_process` 的 `execSync`/`spawn` 测试完整命令：

```javascript
import { execSync } from 'node:child_process'

// 测试 bean add 输出格式
const output = execSync(
  'node dist/main.js bean add --name Test --roaster X --origin X --process X --format json',
  { env: { ...process.env, BREW_GUIDE_SUPABASE_URL: testUrl, BREW_GUIDE_SUPABASE_SERVICE_ROLE_KEY: testKey } }
)
const result = JSON.parse(output.toString())
assert(result.id.startsWith('bean_'))
assert(result.status === 'created')
```

### 配置解析测试（新增）

```javascript
// 验证优先级：env var > .env > config.json
```

---

## 发布检查清单

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] `dist/main.js` 有执行权限（`chmod +x`）
- [ ] `brew-guide --help` 正常输出
- [ ] `brew-guide init` 创建文件权限为 600
- [ ] `brew-guide bean add --help` 显示所有参数（含 `--dry-run`）
- [ ] `brew-guide bean add ... --dry-run` 在无网络/无配置时仍退出码为 0
- [ ] `brew-guide bean add ... --dry-run --format json` 输出包含 `dryRun: true`
- [ ] JSON 模式输出可被 `jq` 解析
- [ ] 版本号 bump（breaking change，建议 1.0.0）
