/**
 * 参数处理小工具。
 */
import { EXIT, exitWithError } from './exit.ts';

/**
 * 取一个"不能是空字符串"的字符串参数。
 *
 * 之前 update 类命令只判断 `typeof === 'string'`，`--name ""` 会把豆名清空。
 * 这里统一拦掉，并提示正确做法。
 */
export function nonEmptyString(value: unknown, flag: string, hint?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.trim() === '') {
    exitWithError(`Error: ${flag} 不能是空字符串${hint ? `（${hint}）` : ''}`, EXIT.USAGE);
  }
  return value;
}

/**
 * 拦住没声明的 flag。
 *
 * citty 不校验未知参数：`bean update x --bean-type filter` 里 --bean-type 没声明，
 * 也照样进 args、退出码 0——只要 run() 里没读这个 key，用户改完发现没生效，命令却一路绿灯。
 * 每个命令在 run() 开头调它，把静默吞参数变成 exit 2。
 */
export function assertKnownFlags(
  args: Record<string, unknown>,
  declared: Record<string, unknown>,
  command: string,
): void {
  const known = new Set(Object.keys(declared));
  known.add('_');
  const unknown = Object.keys(args).filter((key) => !known.has(key));
  if (unknown.length === 0) return;

  const flags = unknown.map((key) => `--${key}`).join(' / ');
  const available = [...known]
    .filter((key) => key !== '_')
    .map((key) => `--${key}`)
    .join(' ');
  exitWithError(`Error: ${command} 不认识 ${flags}。\n可用参数：${available}`, EXIT.USAGE);
}
