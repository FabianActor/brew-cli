/**
 * 记录摘要投影。
 *
 * 列表类输出只返回"看名字能认出这条记录"的标量字段，避免把 base64 图片、
 * 长备注之类的负载带进终端。
 *
 * 数据形状说明（对照线上库）：
 * - brewing_notes 用 rating/totalTime/source/timestamp/notes/equipment；
 *   score/flavor/brewTime/ratio 是旧工具留下的兼容字段。
 * - custom_equipments 用 name/animationType/hasValve/note/isCustom；
 *   brand/model 是旧字段，保留以兼容历史数据。
 * - custom_methods 每行代表一个 equipment，data 顶层只有 equipmentId + methods 数组。
 * - coffee_beans 的产地信息现在放在 `data.blendComponents[]`，
 *   顶层 origin/process/variety 只有历史行还有值。
 */

const SUMMARY_FIELDS: Record<string, string[]> = {
  coffee_beans: [
    'name',
    'roaster',
    'origin',
    'process',
    'variety',
    'region',
    'altitude',
    'roastLevel',
    'beanType',
    'startDay',
    'endDay',
    'roastDate',
    'capacity',
    'remaining',
    'price',
    'isInTransit',
  ],
  brewing_notes: [
    'method',
    'equipment',
    'beanId',
    'rating',
    'totalTime',
    'source',
    'timestamp',
    'notes',
    'score',
    'flavor',
    'ratio',
    'brewTime',
  ],
  custom_equipments: ['name', 'animationType', 'hasValve', 'note', 'isCustom', 'brand', 'model', 'equipmentType', 'category'],
  custom_methods: ['equipmentId', 'name', 'title', 'category', 'description', 'method'],
};

const FALLBACK_FIELDS = ['name', 'title', 'label', 'brand', 'model', 'category', 'type', 'method', 'description'];

/** 从 blendComponents[0] 提升到摘要顶层的字段（仅当顶层没有同名值时）。 */
const COMPONENT_SUMMARY_FIELDS = ['origin', 'country', 'region', 'estate', 'processingStation', 'altitude', 'process', 'variety', 'batch'];

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** 表相关的摘要字段投影。 */
export function pickSummaryFields(table: string, data: Record<string, unknown>) {
  const summary: Record<string, unknown> = {};
  const candidates = [...new Set([...(SUMMARY_FIELDS[table] ?? []), ...FALLBACK_FIELDS])];

  for (const key of candidates) {
    const value = data[key];
    if (isScalar(value)) summary[key] = value;
  }

  // 产地信息已迁到 blendComponents：把第一个成分的字段提到摘要里，
  // 否则列表只能显示名字和烘焙商。
  const components = Array.isArray(data.blendComponents) ? data.blendComponents : [];
  if (components.length > 0) {
    summary.componentCount = components.length;
    const head = components[0];
    if (head && typeof head === 'object' && !Array.isArray(head)) {
      for (const key of COMPONENT_SUMMARY_FIELDS) {
        if (summary[key] !== undefined) continue;
        const value = (head as Record<string, unknown>)[key];
        if (isScalar(value)) summary[key] = value;
      }
    }
  }

  return summary;
}
