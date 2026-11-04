import crypto from 'node:crypto';

/**
 * 生成带前缀的 UUID。
 * @example generateId('bean') => 'bean_a1b2c3d4-...'
 */
export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** 生成 n 位 URL 安全的短随机串（主应用用 nanoid(7) 的风格）。 */
export function shortId(length = 7): string {
  const alphabet = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

/**
 * 生成与 brew-guide 主应用同格式的冲煮方案 ID。
 * 主应用：`method-${Date.now()}-${nanoid(7)}`（customMethodStore.ts:74-76）。
 */
export function generateMethodId(): string {
  return `method-${Date.now()}-${shortId(7)}`;
}
