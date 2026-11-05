/**
 * 输出约定：
 *
 * - 数据走 stdout（`--format json` 一律单行紧凑 JSON，人类视图走普通文本）
 * - 诊断、警告、错误走 stderr（错误统一经 `exitWithError` / `exitForError`）
 *
 * 这样 `brew-guide ... --format json > out.json` 拿到的东西永远能被 JSON.parse 直接吃掉，
 * 不会被夹在中间的提示行破坏。
 */

/**
 * 把 JSON 文本里的非 ASCII 字符换成 `\uXXXX`。
 *
 * 只作用于已经序列化好的 JSON 文本，所以不会破坏结构：非 ASCII 字符只会出现在
 * 字符串字面量里（键和值），换成转义序列后仍是同一个字符串，任何解析器都能读回原文。
 */
export function toAsciiJson(text: string): string {
  return text.replace(/[\u007f-\uffff]/g, (char) => {
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

/**
 * Windows 上什么时候该转义：输出被管道/重定向（非 TTY）时。
 *
 * 原因：控制台默认代码页是 936(GBK)，PowerShell 用当前代码页解码子进程的 UTF-8 输出，
 * 中文这类多字节字符会错位并把后面的引号吃掉 —— 现象是
 * `After parsing a value an unexpected character was encountered: r. Path '[0].origin'`。
 * 转成 ASCII 后不管调用方用什么代码页，JSON 都能解析。
 *
 * 交互式终端不转义（人要看得懂中文）；`BREW_GUIDE_JSON_ASCII=0/1` 可强制关闭/开启。
 */
export function shouldEscapeJson(
  platform: string = process.platform,
  isTTY: boolean = Boolean(process.stdout.isTTY),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const override = env.BREW_GUIDE_JSON_ASCII;
  if (override === '1' || override === 'true') return true;
  if (override === '0' || override === 'false') return false;
  return platform === 'win32' && !isTTY;
}

/** `--format json` 的唯一出口：紧凑单行，方便管道。 */
export function printJson(value: unknown): void {
  const text = JSON.stringify(value);
  console.log(shouldEscapeJson() ? toAsciiJson(text) : text);
}

/** 提示/警告：不污染 stdout。 */
export function warn(message: string): void {
  console.error(message);
}

/**
 * 列表行的人类视图：字段固定为 ` | ` 分隔的若干列。
 *
 * 空值一律填占位符，**不能把空字段从数组里过滤掉** —— 一旦漏掉一列，
 * 后面的值就整体左移，读起来会张冠李戴（比如把 beanId 当成冲煮手法）。
 */
export function formatFields(values: unknown[], emptyPlaceholder = '-'): string {
  return values
    .map((value) => {
      if (value === undefined || value === null || value === '') return emptyPlaceholder;
      return String(value);
    })
    .join(' | ');
}

/** `1 stage` / `3 stages`。 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** 命中 `--limit` 时提醒还有更多；不冒充「总共就这么多」。 */
export function warnMaybeMore(shown: number, limit: number): void {
  if (shown >= limit) {
    warn(`提示：只显示前 ${limit} 条，可能还有更多。要更多就加 --limit（如 --limit 200）。`);
  }
}
