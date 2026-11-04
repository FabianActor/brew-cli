/**
 * 重量/克数处理。
 *
 * brew-guide 把 capacity / remaining 存成字符串（例如 "150"、"120.5"），
 * 展示和比较时需要按数字前缀解析。
 */

/** 把 "150g" / "150 克" / "150 G" 归一化成 "150"；非字符串或清洗后为空则返回 undefined。 */
export function normalizeWeight(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, '').replace(/(g|G|克)$/u, '');
  return normalized || undefined;
}

/** 按数字前缀取克数，解析不了按 0 处理。 */
export function parseGrams(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const match = value.match(/^([\d.]+)/);
  return match ? Number.parseFloat(match[1]) : 0;
}
