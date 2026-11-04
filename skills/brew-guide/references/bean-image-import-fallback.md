# Bean Image Import Fallback

当 `vision_analyze` 失败时，使用 macOS Vision OCR 从咖啡豆截图提取信息并导入 `brew-guide` 的备用工作流。

## 适用场景

- 用户发送了咖啡豆产品截图或 App 截图
- `vision_analyze` 失败、返回空或无法解析本地图片
- 仍需提取豆子信息并导入 `brew-guide`

## 为什么需要这个

用户发送的本地截图（特别是 Telegram 图片缓存路径）即使图片有效，`vision_analyze` 也可能失败。在 macOS 上，可通过原生 Vision 框架的 Swift 脚本可靠地执行 OCR。

## 工作流

1. 加载相关 skill：
   - `brew-guide`（本 skill）
   - `swift-image-ocr`（如有）

2. 若 `vision_analyze` 对本地图片路径失败，立即切换到 macOS Vision OCR。

3. 编写并运行临时 Swift OCR 脚本：
   - import `Foundation`、`Vision`、`AppKit`
   - 用 `NSImage(contentsOfFile:)` 加载图片
   - 转换为 `CGImage`
   - 执行 `VNRecognizeTextRequest`
   - 逐行打印 top candidates

4. 仅解析明确可见的豆子字段。`brew-guide bean add` 最低要求：
   - `name`
   - `roaster`
   - 至少一个成分带 `origin`
   - 至少一个成分带 `process`

5. 写入前：
   - 执行 `brew-guide roasters --format json`
   - 若匹配已有烘焙商，归一化为系统规范名
   - 使用 brew-guide 默认值：
     - `beanType=filter`（未指定时）
     - `roastLevel=浅度烘焙`（filter 豆未指定时）
     - 无 `roastDate` → 按在途豆处理

6. OCR 后仍缺必填字段，只补问该缺失字段。
   - 例：烘焙商缺失但其他齐全 → 只问烘焙商

7. 先执行 `brew-guide bean add --dry-run`。

8. dry-run 正确且用户已表示直接导入 → 执行正式 `brew-guide bean add`。

## 字段映射提示

- 产品标题常组合 国家 + 庄园/批次 + 处理法
- `已选择：100克` → `capacity=100`
- `¥56.00` → `price=56`
- 风味行如 `咖啡花、菠萝、荔枝...` → 逗号分隔 `--flavor`
- 物流/处理站/促销文案 → 仅在用户需要时放入 `notes`
- 用户要求移除备注 → 省略 `--notes`

## 实践经验

Telegram 缓存本地图片：
- `vision_analyze` 可能返回 "There was a problem with the request and the image could not be analyzed."
- 原生 Swift + Vision OCR 仍可提取足够文本完成 brew-guide bean 导入

## 验证清单

- 确认 OCR 输出包含关键产品文本后再提取字段
- 确认必填字段齐全后再导入
- 确认烘焙商尽量匹配 brew-guide 规范列表
- 始终先 `--dry-run` 再正式写入
