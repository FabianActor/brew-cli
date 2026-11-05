import { spawn, spawnSync } from 'node:child_process';

// 测试里默认关掉更新检查：否则每条发起的命令都会去打 npm registry，
// 让用例变慢、也依赖外网。要测更新检查本身的用例显式传 BREW_GUIDE_NO_UPDATE_CHECK: ''。
const BASE_ENV = { BREW_GUIDE_NO_UPDATE_CHECK: '1' };

export function spawnCli(args, options = {}) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts', ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...BASE_ENV, ...(options.env ?? {}) },
    stdio: 'pipe',
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });

  return { child, completion };
}

export async function runInteractiveCli(args, options = {}) {
  const { child, completion } = spawnCli(args, options);

  for (const line of options.inputLines ?? []) {
    child.stdin.write(`${line}\n`);
  }

  if (options.closeStdin !== false) {
    child.stdin.end();
  }

  return completion;
}

export function runCliSync(args, options = {}) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/main.ts', ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...BASE_ENV, ...(options.env ?? {}) },
    encoding: 'utf8',
  });
}
