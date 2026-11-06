import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

import { warn } from './output.ts';

// App 把照片直接存在 JSONB 里：`data.image` / `data.backImage` 是一串
// `data:image/<type>;base64,...`。App 自己上传前会用 canvas 压到 800px 左右，
// CLI 没有 canvas，也不为一个命令行工具塞个原生图形库，所以这里做两件事：
//   1. 认扩展名 → mime，读文件转成 data URL；
//   2. 超过上限就拒绝（base64 是 4/3 膨胀，一行太大既拖慢列表也会撑爆 Supabase 行大小），
//      超过「提醒线」只警告，交给用户自己决定。

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** 硬上限：原始文件字节数。base64 后约 2 MB，和库里现有最大的一张（164 KB 字符）同量级往上留了余量。 */
export const MAX_IMAGE_BYTES = 1_500_000;

/** 提醒线：超过就建议先压一下，但不阻止。 */
export const IMAGE_HINT_BYTES = 400_000;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 读一张本地图片，转成 App 认识的 data URL。
 * 任何失败都抛带上下文的 Error，由调用方决定退出码。
 */
export function readImageAsDataUrl(filePath: string, flag = '--image'): string {
  const extension = extname(filePath).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (!mime) {
    throw new Error(
      `${flag} 只支持 ${Object.keys(MIME_BY_EXTENSION).join(' / ')}，收到 "${filePath}"。`,
    );
  }

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    throw new Error(`${flag} 读不到文件 "${filePath}"。`);
  }
  if (!stat.isFile()) {
    throw new Error(`${flag} 需要一个文件，"${filePath}" 不是文件。`);
  }
  if (stat.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `${flag} 图片太大（${formatBytes(stat.size)}，上限 ${formatBytes(MAX_IMAGE_BYTES)}）。先压到 800px 宽再传，或直接用 App 上传。`,
    );
  }

  const buffer = readFileSync(filePath);
  if (stat.size > IMAGE_HINT_BYTES) {
    warn(
      `提示：${flag} 图片 ${formatBytes(stat.size)}，base64 后约 ${formatBytes(Math.ceil(stat.size / 3) * 4)}，会直接进数据库那一行。App 上传时会压到 800px，CLI 不压 —— 想更小就自己先缩一下。`,
    );
  }
  return `data:${mime};base64,${buffer.toString('base64')}`;
}
