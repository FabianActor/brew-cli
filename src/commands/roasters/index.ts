import { defineCommand } from 'citty';
import logoCommand from './logo.ts';
import listCommand from './list.ts';

export default defineCommand({
  meta: {
    name: 'roasters',
    description: 'List roasters, or manage their logos.',
  },
  subCommands: {
    list: listCommand,
    logo: logoCommand,
  },
});
