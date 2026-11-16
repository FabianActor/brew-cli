/**
 * 图片体积口径 —— 与上游 brew-guide 的 `src/lib/images/imagePolicy.ts` 对齐。
 *
 * 上游是「先压再存」：canvas 把图缩到 maxWidthOrHeight 以内、质量 0.8，
 * 循环压到 maxSizeMB 以下才写库；App 的存量维护
 * （`src/lib/data/sqlite/imageMaintenance.ts`）也按同一组数字把超标的旧图重压。
 *
 * CLI 不解码图片、也不压缩，所以把这组「压缩后的目标」直接当成写入上限来卡：
 * 写进库的图不会比 App 自己产生的更大，App 那边也不会再对你的图做补压。
 *
 * 上游原文（压缩后上限 / 最长边）：
 *   BEAN_IMAGE_COMPRESSION_OPTIONS       0.1 MB / 1200px  —— 表单里新传的豆子图
 *   COFFEE_BEAN_IMAGE_COMPRESSION_OPTIONS 0.3 MB / 1024px —— 豆子详情页，也是存量图补压的上限
 *   NOTE_IMAGE_COMPRESSION_OPTIONS       0.1 MB / 1200px
 *   ROASTER_LOGO_COMPRESSION_OPTIONS     0.12 MB / 512px
 *
 * 豆子图取 0.3 而不是 0.1：0.3 是 App 眼里「不算超标、不会重压」的线，
 * CLI 卡在 0.3 就不会比 App 更严。
 */

export interface ImagePolicy {
  /** 出错信息里怎么称呼这类图。 */
  label: string;
  /** 压缩后允许的最大字节数（上游的 maxSizeMB）。 */
  maxBytes: number;
  /** 压缩后允许的最长边，单位像素（上游的 maxWidthOrHeight）。 */
  maxSide: number;
}

const MB = 1024 * 1024;

export const BEAN_IMAGE_POLICY: ImagePolicy = {
  label: '豆子图片',
  maxBytes: 0.3 * MB,
  maxSide: 1024,
};

export const NOTE_IMAGE_POLICY: ImagePolicy = {
  label: '冲煮记录图片',
  maxBytes: 0.1 * MB,
  maxSide: 1200,
};

export const ROASTER_LOGO_POLICY: ImagePolicy = {
  label: '烘焙商图标',
  maxBytes: 0.12 * MB,
  maxSide: 512,
};

/** 上游 `DEFAULT_MAX_IMAGE_SIZE_BYTES`：读入时的原始文件上限（UI 给的是 50 MB）。 */
export const IMAGE_INPUT_MAX_BYTES = 50 * MB;

/** 把 `maxBytes` 显示成上游那种「0.3 MB」写法。 */
export function formatPolicySize(policy: ImagePolicy): string {
  const mb = policy.maxBytes / MB;
  return `${mb.toFixed(2).replace(/\.?0+$/, '')} MB`;
}
