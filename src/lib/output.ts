/**
 * 输出约定：
 *
 * - 数据走 stdout（`--format json` 一律单行紧凑 JSON，人类视图走普通文本）
 * - 诊断、警告、错误走 stderr（错误统一经 `exitWithError` / `exitForError`）
 *
 * 这样 `brew-guide ... --format json > out.json` 拿到的东西永远能被 JSON.parse 直接吃掉，
 * 不会被夹在中间的提示行破坏。
 */

/** `--format json` 的唯一出口：紧凑单行，方便管道。 */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value));
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
