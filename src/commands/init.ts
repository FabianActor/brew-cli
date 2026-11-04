import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { defineCommand } from 'citty';
import { createCommandLogger } from '../logger.ts';
import { getConfigPath } from '../paths.ts';

function createPrompter() {
  const readline = createInterface({ input, output });
  const bufferedLines: string[] = [];
  const pendingResolvers: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];
  let closed = false;

  // 默认 readline 会把输入原样回显；输入密钥时需要逐字符打码。
  // 这是 readline 内部钩子，没有公开 API，所以类型上放宽处理。
  const writable = readline as unknown as { _writeToOutput?: (chunk: string) => void };
  const defaultWrite = writable._writeToOutput?.bind(readline);
  let masked = false;
  writable._writeToOutput = (chunk: string) => {
    if (!masked) {
      if (defaultWrite) defaultWrite(chunk);
      else output.write(chunk);
      return;
    }
    if (/^[\r\n]+$/.test(chunk)) {
      output.write(chunk);
      return;
    }
    output.write('*'.repeat(chunk.length));
  };

  readline.on('line', (line) => {
    const nextResolver = pendingResolvers.shift();
    if (nextResolver) {
      nextResolver.resolve(line);
      return;
    }

    bufferedLines.push(line);
  });

  readline.on('close', () => {
    closed = true;
    while (pendingResolvers.length > 0) {
      pendingResolvers.shift()?.reject(new Error('Setup cancelled'));
    }
  });

  function ask(prompt: string) {
    output.write(prompt);

    if (bufferedLines.length > 0) {
      return Promise.resolve(bufferedLines.shift() as string);
    }

    if (closed) {
      return Promise.reject(new Error('Setup cancelled'));
    }

    return new Promise((resolve, reject) => {
      pendingResolvers.push({ resolve, reject });
    });
  }

  /** 输入不回显（打 *），用于密钥。非 TTY 环境回退成普通 ask。 */
  async function askHidden(prompt: string) {
    if (!input.isTTY || !output.isTTY) {
      return ask(prompt);
    }
    masked = true;
    try {
      return await ask(prompt);
    } finally {
      masked = false;
    }
  }

  return {
    ask,
    askHidden,
    close() {
      readline.close();
    },
  };
}

async function promptForConfig() {
  const prompter = createPrompter();
  const configPath = getConfigPath();

  try {
    const exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);

    if (exists) {
      const overwrite = String(await prompter.ask('已有配置，是否覆盖？(y/n) ')).trim();
      if (!/^(y)$/i.test(overwrite)) {
        return;
      }
    }

    let supabaseUrl = '';
    while (!supabaseUrl.startsWith('https://')) {
      supabaseUrl = String(await prompter.ask('Supabase URL: ')).trim();
      if (!supabaseUrl.startsWith('https://')) {
        console.log('Supabase URL must start with https://');
      }
    }

    const supabaseServiceRoleKey = String(await prompter.askHidden('Service Role Key (input hidden): ')).trim();
    const userInput = String(await prompter.ask('User ID (default_user): ')).trim();
    const brewGuideUserId = userInput || 'default_user';

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          supabaseUrl,
          supabaseServiceRoleKey,
          brewGuideUserId,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    // Windows 没有 POSIX 权限位，chmod 是空操作；只在类 Unix 上收紧权限。
    if (process.platform !== 'win32') {
      await fs.chmod(configPath, 0o600);
    }

    console.log(`配置已保存至 ${configPath}`);
  } catch (error) {
    console.error('Setup cancelled');
    process.exit(130);
  } finally {
    prompter.close();
  }
}

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize brew-guide CLI config.',
  },
  async run({ args }) {
    const logger = createCommandLogger(['init'], args as Record<string, unknown>);

    try {
      await promptForConfig();
      await logger.success();
    } catch (error) {
      await logger.error(error);
      throw error;
    }
  },
});
