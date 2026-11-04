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
 * 找出 args 里没在 argsDef 声明过的 flag（`_` 是 citty 的元数据，忽略）。
 *
 * 单独抽出来是为了能直接测：`assertKnownFlags` 会 process.exit，测试进程里调不得。
 */
export function findUnknownFlags(
  args: Record<string, unknown>,
  declared: Record<string, unknown>,
): string[] {
  const known = new Set(Object.keys(declared));
  known.add('_');
  return Object.keys(args).filter((key) => !known.has(key));
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
  const unknown = findUnknownFlags(args, declared);
  if (unknown.length === 0) return;

  const known = Object.keys(declared).filter((key) => key !== '_');
  const flags = unknown.map((key) => `--${key}`).join(' / ');
  const available = known.map((key) => `--${key}`).join(' ');
  exitWithError(`Error: ${command} 不认识 ${flags}。\n可用参数：${available}`, EXIT.USAGE);
}
