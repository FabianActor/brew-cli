/**
 * 退出码约定（sysexits 风格 + 参数错误）：
 *
 * - 2  USAGE     参数错误（非法 flag、缺必填、越界）
 * - 64 CONFIG    缺少/非法配置（提示跑 brew-guide init）
 * - 65 NETWORK   请求 Supabase 失败
 * - 1  FAILURE   其他运行时错误（记录不存在、覆盖冲突等）
 */
export const EXIT = {
  USAGE: 2,
  CONFIG: 64,
  NETWORK: 65,
  FAILURE: 1,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export function exitWithError(message: string, code: ExitCode): never {
  console.error(message);
  process.exit(code);
}
