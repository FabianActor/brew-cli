/**
 * 生豆（beanState === 'green'）在 CLI 里整体关闭。
 *
 * 原因：App 的生豆不是"一个字段"，而是一套流程 —— 生豆记购买日期、按库存算余量、
 * 详情页把「冲煮记录」换成「烘焙记录」，「转为生豆」要走 RoastingManager 的转换
 * （新建生豆 + 建烘焙记录 + 新建熟豆，`page.tsx:4538`），编辑页对生豆还隐藏了在途开关
 * （`BasicInfo.tsx:633`）。CLI 只做半套（改字段、清日期）会写出 App 里看不见或不该存在的
 * 状态：冲煮记录挂在生豆上但生豆详情不展示它、生豆被标成"在途"、列表里分不清生豆和
 * 忘了填烘焙日期的熟豆。所以这里一律拒绝，让用户去 App 里操作。
 */
import { EXIT, exitWithError } from './exit.ts';

/** 拒绝时的统一文案（用户要求原文照此返回）。 */
export const GREEN_BEAN_REJECTION = '暂不支持生豆系列操作，请至 APP 查看并操作。';

/** 列表里隐藏生豆时的提示。 */
export function hiddenGreenBeanNotice(count: number): string {
  return `提示：另有 ${count} 款生豆未显示（CLI 暂不支持生豆系列操作），请至 APP 查看。`;
}

/** 数据行是不是生豆。缺字段按熟豆算（App 侧默认也是 roasted）。 */
export function isGreenBean(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  return (data as Record<string, unknown>).beanState === 'green';
}

/** 遇到生豆相关的请求就退出（exit 2，用法层面拒绝，不是"数据出错"）。 */
export function rejectGreenBean(): never {
  exitWithError(`Error: ${GREEN_BEAN_REJECTION}`, EXIT.USAGE);
}
