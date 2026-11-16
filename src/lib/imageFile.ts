import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

import {
  BEAN_IMAGE_POLICY,
  IMAGE_INPUT_MAX_BYTES,
  type ImagePolicy,
  formatPolicySize,
} from './imagePolicy.ts';
import { warn } from './output.ts';

// App 把照片直接存在 JSONB 里：`data.image` / `data.backImage` 是一串
// `data:image/<type>;base64,...`。App 自己上传前会用 canvas 压到 imagePolicy 里的
// 那组目标（豆子 0.3 MB / 记录 0.1 MB）；CLI 不做压缩（也不为此塞个图形库），
// 所以这里做三件事：
//   1. 认扩展名 → mime，读文件转成 data URL；
//   2. 超过对应用途的上限就拒绝 —— 写进去的图和 App 产生的一样大，
//      不会被 App 的存量维护当成「超标图」重压，也不会撑爆 Supabase 行；
//   3. GIF 上游是原样存（不压缩），这里也不拦，只在超过上限时提醒一句。

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ReadImageOptions {
  /** 出错时用哪个 flag 名字，默认 `--image`。 */
  flag?: string;
  /** 这张图存在哪个字段上，默认按豆子图（0.3 MB）算。 */
  policy?: ImagePolicy;
}

/**
 * 读一张本地图片，转成 App 认识的 data URL。
 * 任何失败都抛带上下文的 Error，由调用方决定退出码。
 */
export function readImageAsDataUrl(filePath: string, options: ReadImageOptions = {}): string {
  const { flag = '--image', policy = BEAN_IMAGE_POLICY } = options;

  const extension = extname(filePath).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (!mime) {
    throw new Error(
      `${flag} 只支持 ${Object.keys(MIME_BY_EXTENSION).join(' / ')}（HEIC 请先转成 JPG），收到 "${filePath}"。`,
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

  // 上游读入时就卡 50 MB；这里先按它拦一次，免得为一个几 GB 的文件把内存撑满。
  if (stat.size > IMAGE_INPUT_MAX_BYTES) {
    throw new Error(
      `${flag} 图片文件过大（${formatBytes(stat.size)}，上限 50 MB）。`,
    );
  }

  const limit = `${formatPolicySize(policy)}（${policy.maxSide}px 以内）`;
  if (stat.size > policy.maxBytes) {
    // GIF 上游不压缩、原样存（`processImageFile` 里直接 return dataUrl），
    // 拦到上限反而比 App 更严，所以只提醒。
    if (mime === 'image/gif') {
      warn(
        `提示：GIF 不会被压缩（App 也是原样存），这张图 ${formatBytes(stat.size)}，比${policy.label}常规上限 ${limit} 大。`,
      );
    } else {
      throw new Error(
        `${flag} 这张图 ${formatBytes(stat.size)}，超过${policy.label}上限 ${limit}。` +
          `App 上传前会压到这条线以内，CLI 不做压缩：先把图缩小再传，或直接用 App 上传。`,
      );
    }
  }

  const buffer = readFileSync(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}
