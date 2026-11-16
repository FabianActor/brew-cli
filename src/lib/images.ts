/**
 * 记录里的内嵌图片（data URL 的 base64）在终端里既看不懂，又能到几百 KB 一条。
 *
 * `bean get` / `note get` 默认把图片换成一句占位，要看原图得显式加 `--with-images`。
 * 这里只做「找出来 + 换占位」这一件事，字段名由调用方给（豆子是 image/backImage，记录是 image）。
 */

import { formatBytes } from './imageFile.ts';

const DATA_IMAGE_PATTERN = /^data:image\//;

export function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && DATA_IMAGE_PATTERN.test(value);
}

/** data URL 里 base64 载荷对应的字节数（不含 `data:image/png;base64,` 前缀）。 */
export function imageDataUrlBytes(value: string): number {
  const comma = value.indexOf(',');
  const payload = comma >= 0 ? value.slice(comma + 1) : value;
  return Math.round((payload.length * 3) / 4);
}

/** 人看的体积，用来告诉用户被省掉的东西有多大。只算 base64 载荷，不含 `data:image/png;base64,` 前缀。 */
export function describeImageSize(value: string): string {
  const bytes = imageDataUrlBytes(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const OMITTED_SUFFIX = '（已省略，加 --with-images 输出原图）';

/**
 * 返回一份把指定字段里的 data URL 换成占位字符串的副本；其他字段原样保留。
 * 记录本身不变（调用方传什么不会被改）。
 */
export function redactImages(record: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  let result: Record<string, unknown> | null = null;

  for (const field of fields) {
    const value = record[field];
    if (!isImageDataUrl(value)) continue;

    result ??= { ...record };
    result[field] = `[image ${describeImageSize(value)}${OMITTED_SUFFIX}]`;
  }

  return result ?? record;
}

/**
 * 一条记录 `data` 的 JSON 体积上限。
 *
 * 这**不是**图片上限：图片按用途卡在 `src/lib/imagePolicy.ts`（豆子 0.3 MB / 记录 0.1 MB，
 * 与上游 brew-guide 压缩后的目标一致）。这里只是整行的兜底 —— 图片上限再加备注、成分和
 * base64 膨胀，正常记录离 3 MB 还远；真撞上说明有别的东西撑爆了行，这时报出来比等
 * PostgREST 回 400 强。
 *
 * 原来是 64 KB —— 那是 MCP 时代给工具返回值留的预算，不是 PostgREST 的限制。
 * 实测（2026-11-16，本项目实例）391 KB / 1.2 MB / 2.5 MB 的 payload 都能写进去。
 */
export const MAX_RECORD_PAYLOAD_BYTES = 3_000_000;

/** 超过上限就抛错，错误里带真实大小 —— 别只说 "exceeds 64 KB"，用户量不出来。 */
export function assertRecordPayloadFits(dataJson: string, entity: string): void {
  const bytes = Buffer.byteLength(dataJson, 'utf8');
  if (bytes <= MAX_RECORD_PAYLOAD_BYTES) return;

  throw new Error(
    `${entity}数据太大（${formatBytes(bytes)}，上限 ${formatBytes(MAX_RECORD_PAYLOAD_BYTES)}）。检查是不是塞了多张图，或直接用 App 上传。`,
  );
}

/** 人读视图里的一行体积摘要；没有图片时返回空数组。 */
export function describeImages(record: Record<string, unknown>, fields: readonly string[]): string[] {
  const found = fields
    .map((field) => [field, record[field]] as const)
    .filter(([, value]) => isImageDataUrl(value))
    .map(([field, value]) => `${field} ${describeImageSize(value as string)}`);

  return found.length > 0 ? [found.join(', ')] : [];
}
