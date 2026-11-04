import { EXIT, exitWithError } from './exit.ts';

/**
 * 冲煮记录输入的校验与归一化。
 *
 * 口径来自 App 的类型定义：
 * - `rating: number`（0-5，`BrewingNote.rating`，`RatingSection.tsx:42` 按 /5 显示）
 * - `MethodParams.temp: string`（带单位，如 "92°C"）
 * - `Stage`（`brew-guide/src/lib/core/config.ts:36-47`）：`label`、`detail` 必有，
 *   `water` 是字符串、`duration` 是秒数，旧数据里还有 `name`/`time` 这类别名。
 */

export function parseRating(value: string, flag = '--rating'): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    exitWithError(`Error: ${flag} 必须是数字（0-5），收到 "${value}"。`, EXIT.USAGE);
  }
  if (parsed < 0 || parsed > 5) {
    exitWithError(`Error: ${flag} 必须在 0 到 5 之间，收到 ${value}。`, EXIT.USAGE);
  }
  return parsed;
}

/** 只接受数字，可带 °C / ℃ / C 单位；统一写成 "92°C"。 */
export function parseTemperature(value: string): string {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:°\s*[cCfF]|℃|℉|[cC])?$/);
  if (!match) {
    exitWithError(`Error: --water-temp 只接受数字（如 92 或 92°C），收到 "${value}"。`, EXIT.USAGE);
  }
  return `${match[1]}°C`;
}

const STAGES_EXAMPLE =
  '[{"label":"闷蒸","water":"30g","duration":30,"detail":"注入 30g 水，等待 30 秒"}]';

function describeIndex(index: number): string {
  return `第 ${index + 1} 个阶段`;
}

/**
 * 校验并归一化 --stages-json。
 * 兼容旧字段名（name → label、time → duration），其余未知字段原样保留。
 */
export function parseStages(raw: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    exitWithError(
      `Error: --stages-json must be valid JSON. 例如：'${STAGES_EXAMPLE}'。`,
      EXIT.USAGE,
    );
  }
  if (!Array.isArray(parsed)) {
    exitWithError(`Error: --stages-json 必须是数组，例如：'${STAGES_EXAMPLE}'。`, EXIT.USAGE);
  }

  return parsed.map((stage, index) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      exitWithError(`Error: --stages-json ${describeIndex(index)}不是对象。`, EXIT.USAGE);
    }

    const source = { ...(stage as Record<string, unknown>) };
    const rawLabel = source.label ?? source.name;
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
    if (!label) {
      exitWithError(
        `Error: --stages-json ${describeIndex(index)}缺少 label（阶段标题）。例如：'${STAGES_EXAMPLE}'。`,
        EXIT.USAGE,
      );
    }

    const normalized: Record<string, unknown> = { ...source, label };

    if (normalized.detail === undefined || normalized.detail === null) {
      normalized.detail = '';
    } else if (typeof normalized.detail !== 'string') {
      normalized.detail = String(normalized.detail);
    }

    if (normalized.water !== undefined && normalized.water !== null) {
      if (typeof normalized.water === 'number') {
        normalized.water = String(normalized.water);
      } else if (typeof normalized.water !== 'string') {
        exitWithError(
          `Error: --stages-json ${describeIndex(index)}的 water 必须是字符串或数字。`,
          EXIT.USAGE,
        );
      }
    }

    const rawDuration = normalized.duration ?? normalized.time;
    if (rawDuration !== undefined && rawDuration !== null) {
      const duration = Number(rawDuration);
      if (!Number.isFinite(duration) || duration < 0) {
        exitWithError(
          `Error: --stages-json ${describeIndex(index)}的 duration 必须是非负秒数。`,
          EXIT.USAGE,
        );
      }
      normalized.duration = duration;
    }

    if (normalized.valveStatus !== undefined && normalized.valveStatus !== null) {
      if (normalized.valveStatus !== 'open' && normalized.valveStatus !== 'closed') {
        exitWithError(
          `Error: --stages-json ${describeIndex(index)}的 valveStatus 只能是 "open" 或 "closed"。`,
          EXIT.USAGE,
        );
      }
    }

    return normalized;
  });
}
