import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type CommandLogStatus = 'success' | 'error';

export interface CommandLogEntry {
  command: string[];
  args: Record<string, unknown>;
  status: CommandLogStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  error?: string;
}

function getLogPath() {
  return process.env.BREW_GUIDE_LOG_PATH || path.join(os.homedir(), '.config', 'brew-guide', 'commands.log');
}

/** 单个日志文件的上限；超过就滚到 .1（只保留一代）。 */
const MAX_LOG_BYTES = 1_000_000;
/** 单个参数值最多记多少字符，避免把整段备注 / base64 写进日志。 */
const MAX_VALUE_CHARS = 200;

function clipValue(value: unknown): unknown {
  if (typeof value === 'string' && value.length > MAX_VALUE_CHARS) {
    return `${value.slice(0, MAX_VALUE_CHARS)}…[${value.length} chars]`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => clipValue(item));
  }
  return value;
}

function sanitizeArgs(args: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => {
      if (/key|token|secret|password/i.test(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, clipValue(value)];
    }),
  );
}

async function rotateIfNeeded(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size < MAX_LOG_BYTES) return;
    const rotated = `${filePath}.1`;
    await fs.rm(rotated, { force: true });
    await fs.rename(filePath, rotated);
  } catch {
    // 不存在 / 不可写都不该影响命令本身
  }
}

async function appendJsonLine(filePath: string, line: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, 'utf8');
}

export async function logCommandUsage(entry: CommandLogEntry) {
  if (process.env.BREW_GUIDE_LOG_DISABLED === '1') return;

  try {
    const filePath = getLogPath();
    await rotateIfNeeded(filePath);
    const payload = {
      ...entry,
      args: sanitizeArgs(entry.args),
      pid: process.pid,
    };
    await appendJsonLine(filePath, JSON.stringify(payload));
  } catch {
    // logging must never break the CLI
  }
}

export function createCommandLogger(command: string[], args: Record<string, unknown>) {
  const startedAt = new Date();

  return {
    async success() {
      const finishedAt = new Date();
      await logCommandUsage({
        command,
        args,
        status: 'success',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
    },
    async error(error: unknown) {
      const finishedAt = new Date();
      const message = error instanceof Error ? error.message : String(error);
      await logCommandUsage({
        command,
        args,
        status: 'error',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error: message,
      });
    },
  };
}
