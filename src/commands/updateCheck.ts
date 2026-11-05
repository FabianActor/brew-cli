import { defineCommand } from 'citty';
import packageJson from '../../package.json' with { type: 'json' };
import { createCommandLogger } from '../logger.ts';
import { assertKnownFlags } from '../lib/args.ts';
import { EXIT, exitWithError } from '../lib/exit.ts';
import { printJson } from '../lib/output.ts';
import { PACKAGE_NAME, checkForUpdate } from '../lib/updateCheck.ts';

const argsDef = {
  format: { type: 'string', description: 'json 输出 {"current","latest","upgradable"}。' },
} as const;

export default defineCommand({
  meta: {
    name: 'update-check',
    description: 'Check whether a newer version is published on npm.',
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['update-check'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'update-check');

    const status = await checkForUpdate(packageJson.version);
    if (!status) {
      await logger.error('update check failed');
      exitWithError(
        [
          'Error: 查不到 npm 上的最新版本（连了两次都没成功：网络不通或 registry 异常）。',
          `       手动确认：npm view ${PACKAGE_NAME} version`,
        ].join('\n'),
        EXIT.NETWORK,
      );
    }

    if (args.format === 'json') {
      printJson(status);
      await logger.success();
      return;
    }

    if (status.upgradable) {
      console.log(`当前 ${status.current} → 最新 ${status.latest}。`);
      console.log(`升级：npm install -g ${PACKAGE_NAME}@latest`);
    } else {
      console.log(`已是最新版本（${status.current}）。`);
    }

    await logger.success();
  },
});
