import { EXIT, exitWithError } from './exit.ts';

/**
 * App 认识的器具动画类型：`EquipmentAnimationType`（`brew-guide/src/lib/core/config.ts:94-102`）的
 * 全集 —— v60 / kalita / origami / orea / sinloy / clever / custom / espresso。
 * 少写一个值，App 里能建的器具 CLI 就会拒（0.3.5 之前漏了 orea 和 sinloy）。
 */
export const ANIMATION_TYPES = [
  'v60',
  'kalita',
  'origami',
  'orea',
  'sinloy',
  'clever',
  'custom',
  'espresso',
] as const;

export type AnimationType = (typeof ANIMATION_TYPES)[number];

export function assertAnimationType(value: string, flag = '--animation-type'): string {
  if (!(ANIMATION_TYPES as readonly string[]).includes(value)) {
    exitWithError(`Error: ${flag} must be one of ${ANIMATION_TYPES.join(', ')}.`, EXIT.USAGE);
  }
  return value;
}

/**
 * App 内置器具（`brew-guide/src/lib/core/config.ts:257-289` 的 `equipmentList`）。
 * 它们不在 custom_equipments 表里，但 `note add --equipment V60` 必须能用。
 */
export const BUILTIN_EQUIPMENTS = [
  { id: 'V60', name: 'V60' },
  { id: 'CleverDripper', name: '聪明杯' },
  { id: 'Kalita', name: 'Kalita' },
  { id: 'Origami', name: 'Origami' },
  { id: 'Orea', name: 'OREA' },
  { id: 'Sinloy', name: 'Sinloy' },
  { id: 'Espresso', name: '意式咖啡机' },
] as const;

export function findBuiltinEquipment(id: string): { id: string; name: string } | undefined {
  return BUILTIN_EQUIPMENTS.find(
    (item) => item.id.toLowerCase() === id.toLowerCase() || item.name === id,
  );
}

export function builtinEquipmentHint(): string {
  return `内置器具：${BUILTIN_EQUIPMENTS.map((item) => item.id).join(' / ')}`;
}
