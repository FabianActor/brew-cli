import type { BlendComponent } from '../types/coffeeBean.ts';

/**
 * 拼配成分解析。
 *
 * `bean add` / `bean update` 共用：
 * - 单成分用扁平 flag：--origin / --country / --region / --estate / --processing-station /
 *   --altitude / --process / --variety / --batch / --percentage
 * - 多成分用可重复的 --component "origin=秘鲁;region=卡哈马卡;process=水洗;percentage=33"
 */

/** 扁平 flag（kebab-case）→ blendComponents 的 key */
export const COMPONENT_FLAG_KEYS = {
  country: 'country',
  origin: 'origin',
  region: 'region',
  estate: 'estate',
  'processing-station': 'processingStation',
  process: 'process',
  variety: 'variety',
  altitude: 'altitude',
  batch: 'batch',
} as const;

export type ComponentFlagName = keyof typeof COMPONENT_FLAG_KEYS;

const SPEC_ALIASES: Record<string, keyof BlendComponent> = {
  country: 'country',
  origin: 'origin',
  region: 'region',
  estate: 'estate',
  'processing-station': 'processingStation',
  processingstation: 'processingStation',
  processingStation: 'processingStation',
  station: 'processingStation',
  process: 'process',
  variety: 'variety',
  altitude: 'altitude',
  batch: 'batch',
  percentage: 'percentage',
  percent: 'percentage',
  pct: 'percentage',
};

const SEPARATOR = /[;|]|,(?=\s*[A-Za-z-]+\s*=)/;

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(2);
}

function normalizeSpecKey(rawKey: string): string {
  return rawKey.trim().replace(/[_\s]+/g, '-').toLowerCase();
}

/** 解析一条 `--component` 规格字符串。 */
export function parseComponentSpec(spec: string, specIndex: number): BlendComponent {
  const component: Record<string, unknown> = {};

  for (const chunk of spec.split(SEPARATOR)) {
    const part = chunk.trim();
    if (!part) continue;

    const eq = part.indexOf('=');
    if (eq <= 0) {
      fail(
        `--component #${specIndex + 1} 的 "${part}" 不是 key=value 形式，示例：--component "origin=秘鲁;region=卡哈马卡;process=水洗;percentage=33"`,
      );
    }

    const rawKey = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    const normalized = normalizeSpecKey(rawKey);
    const key = SPEC_ALIASES[normalized] ?? SPEC_ALIASES[rawKey.trim()];

    if (!key) {
      fail(
        `--component 不认识字段 "${rawKey}"，可用：country / origin / region / estate / processingStation / process / variety / altitude / batch / percentage`,
      );
    }
    if (!value) continue;

    if (key === 'percentage') {
      const numeric = Number(value.replace(/%$/, ''));
      if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) {
        fail(`--component #${specIndex + 1} 的 percentage 必须是 1-100 的数字，收到 "${value}"`);
      }
      component.percentage = numeric;
      continue;
    }

    component[key] = value;
  }

  return component as BlendComponent;
}

/** 从扁平 flag 里取成分字段。 */
export function componentFromFlags(args: Record<string, unknown>): BlendComponent {
  const component: Record<string, unknown> = {};
  for (const [flag, key] of Object.entries(COMPONENT_FLAG_KEYS)) {
    const value = args[flag];
    if (typeof value === 'string' && value.trim()) {
      component[key] = value.trim();
    }
  }
  const percentage = args.percentage;
  if (typeof percentage === 'string' && percentage.trim()) {
    const numeric = Number(percentage.replace(/%$/, '').trim());
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) {
      fail(`--percentage 必须是 1-100 的数字，收到 "${percentage}"`);
    }
    component.percentage = numeric;
  }
  return component as BlendComponent;
}

/** 把扁平 flag 的值补进第一个还没设置该字段的成分。 */
function fillMissing(components: BlendComponent[], flags: BlendComponent): void {
  if (components.length === 0) {
    if (Object.keys(flags).length > 0) components.push({ ...flags });
    return;
  }
  const target = components[0] as Record<string, unknown>;
  for (const [key, value] of Object.entries(flags)) {
    if (target[key] === undefined || target[key] === '') target[key] = value;
  }
}

/**
 * 合并 --component 规格与扁平 flag，得到最终成分数组。
 * 没有 --component 时等价于单成分。
 */
export function buildBlendComponents(
  specs: unknown,
  flags: BlendComponent,
): BlendComponent[] {
  const list = Array.isArray(specs) ? specs : typeof specs === 'string' ? [specs] : [];
  const components = list
    .filter((spec): spec is string => typeof spec === 'string' && spec.trim().length > 0)
    .map((spec, index) => parseComponentSpec(spec, index));

  fillMissing(components, flags);
  return components;
}

/**
 * 成分是**可选**的：App 的表单里只有「咖啡豆名称」是必填，产地、处理法、烘焙商都能空着存
 * （`brew-guide/src/components/coffee-bean/Form/components/BasicInfo.tsx:481-521` 只有名称带 `*`）。
 * 所以这里不做「必须带 origin/process」的校验，命令行也只要求 --name。
 */
