import { defineCommand, runMain } from 'citty';
import packageJson from '../package.json' with { type: 'json' };
import backupCommand from './commands/backup.ts';
import beanCommand from './commands/bean/index.ts';
import equipmentCommand from './commands/equipment/index.ts';
import initCommand from './commands/init.ts';
import methodCommand from './commands/method/index.ts';
import noteCommand from './commands/note/index.ts';
import roastersCommand from './commands/roasters/index.ts';
import updateCheckCommand from './commands/updateCheck.ts';
import { assertValidFormat } from './lib/output.ts';
import { maybeNotifyUpdate, startBackgroundUpdateCheck } from './lib/updateCheck.ts';

const main = defineCommand({
  meta: {
    name: 'brew-guide',
    version: packageJson.version,
    description: 'CLI for operating brew-guide data in Supabase.',
  },
  subCommands: {
    init: initCommand,
    bean: beanCommand,
    note: noteCommand,
    equipment: equipmentCommand,
    method: methodCommand,
    roasters: roastersCommand,
    backup: backupCommand,
    'update-check': updateCheckCommand,
  },
});

// --version / --help / 直接敲命令名 / update-check 自己都不用提示更新。
function shouldCheckForUpdates(argv: string[]): boolean {
  if (argv.length === 0) {
    return false;
  }
  if (argv[0] === 'update-check') {
    return false;
  }
  return !argv.some((arg) => ['--version', '-v', '--help', '-h'].includes(arg));
}

/**
 * citty 没有「默认子命令」：父命令一旦声明了 `subCommands`，光敲父命令会报
 * `No command specified`。`brew-guide roasters` 从 0.2.x 起一直是「列名单」，
 * 加了 `roasters logo` 之后这个用法不能变，所以在入口把裸调用补成 `list`。
 *
 * `--help` 例外：让它显示父命令的帮助，否则看不到 `logo` 这个子命令。
 */
export function normalizeArgv(argv: string[]): string[] {
  if (argv[0] !== 'roasters') return argv;

  const rest = argv.slice(1);
  if (rest.some((arg) => arg === '--help' || arg === '-h')) return argv;
  // 已经有位置参数（`list` / `logo`）就按原样走。
  if (rest.some((arg) => !arg.startsWith('-'))) return argv;

  return ['roasters', 'list', ...rest];
}

async function bootstrap(): Promise<void> {
  const argv = normalizeArgv(process.argv.slice(2));
  // 写错的 --format 会在任何命令里静默退回人类视图，这里统一拦下。
  assertValidFormat(argv);
  if (shouldCheckForUpdates(argv)) {
    // 后台刷新缓存（不阻塞）；提示只用缓存里的结果，不联网等待。
    startBackgroundUpdateCheck(packageJson.version);
    await maybeNotifyUpdate(packageJson.version);
  }

  await runMain(main, { rawArgs: argv });
}

await bootstrap();
