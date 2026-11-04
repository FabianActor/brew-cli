import { defineCommand, runMain } from 'citty';
import packageJson from '../package.json' with { type: 'json' };
import backupCommand from './commands/backup.ts';
import beanCommand from './commands/bean/index.ts';
import equipmentCommand from './commands/equipment/index.ts';
import initCommand from './commands/init.ts';
import methodCommand from './commands/method/index.ts';
import noteCommand from './commands/note/index.ts';
import roastersCommand from './commands/roasters.ts';

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
  },
});

runMain(main);
