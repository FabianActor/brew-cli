/**
 * `roasters` 既是命令也是命令组（`roasters list` / `roasters logo`）。
 *
 * citty 没有「默认子命令」这回事：有 subCommands 时它先跑子命令，之后仍会执行父命令的
 * `run`；父命令只有 run 没有子命令、又没给位置参数时又会抛 `No command specified`。
 * 所以「裸 `roasters` 等于 `roasters list`」只能在进入 citty 之前改写 argv。
 */
export function normalizeArgv(argv: string[]): string[] {
  if (argv[0] !== 'roasters') return argv;

  const rest = argv.slice(1);
  if (rest.some((arg) => arg === '--help' || arg === '-h')) return argv;
  // 只省略了子命令（`roasters --format json`）才补 list：第一个词不是 flag 时
  // 可能真的是子命令，也可能拼错了，交给 citty 报「Unknown command」，别把错误吞掉。
  if (rest.length > 0 && !rest[0].startsWith('-')) return argv;

  return ['roasters', 'list', ...rest];
}
