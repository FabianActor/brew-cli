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

/**
 * 把异常分流成退出码：配置缺失 64、Supabase 请求失败 65，其余 1。
 * 错误文案沿用历史格式（`Error: Config …` / `Error: Network …`），避免破坏已有断言。
 */
export function exitForError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/Missing|Config error/i.test(message)) {
    exitWithError(`Error: Config ${message}`, EXIT.CONFIG);
  }
  if (/^Failed to (list|fetch|delete|upsert) /i.test(message)) {
    exitWithError(`Error: Network ${message}`, EXIT.NETWORK);
  }
  exitWithError(`Error: ${message}`, EXIT.FAILURE);
}
