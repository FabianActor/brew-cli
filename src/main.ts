import { defineCommand, runMain } from 'citty';
import packageJson from '../package.json' with { type: 'json' };
import backupCommand from './commands/backup.ts';
import beanCommand from './commands/bean/index.ts';
import equipmentCommand from './commands/equipment/index.ts';
import initCommand from './commands/init.ts';
import methodCommand from './commands/method/index.ts';
import noteCommand from './commands/note/index.ts';
import roastersCommand from './commands/roasters.ts';
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

async function bootstrap(): Promise<void> {
  const argv = process.argv.slice(2);
  // 写错的 --format 会在任何命令里静默退回人类视图，这里统一拦下。
  assertValidFormat(argv);
  if (shouldCheckForUpdates(argv)) {
    // 后台刷新缓存（不阻塞）；提示只用缓存里的结果，不联网等待。
    startBackgroundUpdateCheck(packageJson.version);
    await maybeNotifyUpdate(packageJson.version);
  }

  await runMain(main);
}

await bootstrap();
