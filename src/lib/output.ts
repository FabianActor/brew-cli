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
