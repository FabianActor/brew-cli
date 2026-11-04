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
