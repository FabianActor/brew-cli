/**
 * 四个实体（bean / equipment / method / note）的 get 与 delete 命令骨架。
 *
 * 这些命令原本是 8 个各自 56–59 行的文件，只有实体名、取数函数和字段排版不同。
 * 这里把流程抽出来，实体文件退化成一份配置。
 */
import { defineCommand } from 'citty';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../client.ts';
import { resolveConfig } from '../config.ts';
import { createCommandLogger } from '../logger.ts';
import { assertKnownFlags } from './args.ts';
import { EXIT, exitForError, exitWithError } from './exit.ts';
import { describeImages, redactImages } from './images.ts';
import { printJson } from './output.ts';

/** 人读视图里图片被省掉时的后缀，和 JSON 里的占位保持一个说法。 */
const OMITTED_HINT = '（已省略，加 --with-images 输出原图）';

interface EntitySpec {
  /** 命令路径第一段，例如 'bean'；也用作日志分类和 dry-run 文案里的实体名。 */
  entity: string;
  /** 面向人的实体名，例如 'Bean'。 */
  label: string;
  idDescription: string;
}

export interface EntityGetSpec<T> extends EntitySpec {
  getDescription: string;
  fetch: (supabase: SupabaseClient, id: string, userId: string) => Promise<T | null>;
  /** 人类可读的字段排版。 */
  describe: (record: T) => string[];
  /**
   * 取到记录之后的拦截钩子：需要按内容拒绝整类记录时用（例如豆子是生豆）。
   * 抛错/退出由它自己处理，钩子正常返回才继续输出。
   */
  guard?: (record: T) => void;
  /**
   * 记录里放 base64 图片的字段名（豆子是 image/backImage，冲煮记录是 image）。
   * 有了它，`get` 默认把图片换成体积占位，`--with-images` 才输出原图。
   */
  imageFields?: readonly string[];
}

export interface EntityDeleteSpec extends EntitySpec {
  deleteDescription: string;
  remove: (supabase: SupabaseClient, id: string, userId: string) => Promise<boolean>;
}

const WITH_IMAGES_ARG = {
  type: 'boolean',
  description: 'Include the inline base64 images. Off by default: one bean photo can be hundreds of KB.',
} as const;

export function createGetCommand<T>(spec: EntityGetSpec<T>) {
  // 只有带图片字段的实体才暴露 --with-images，别的命令的帮助里不该出现这个开关。
  const argsDef = (
    spec.imageFields
      ? {
          id: { type: 'positional', required: true, description: spec.idDescription },
          'with-images': WITH_IMAGES_ARG,
          format: { type: 'string' },
        }
      : {
          id: { type: 'positional', required: true, description: spec.idDescription },
          format: { type: 'string' },
        }
  ) as Record<string, { type: 'positional' | 'string' | 'boolean'; required?: true; description?: string }>;

  return defineCommand({
    meta: {
      name: 'get',
      description: spec.getDescription,
    },
    args: argsDef,
    async run({ args }) {
      const logger = createCommandLogger([spec.entity, 'get'], args as Record<string, unknown>);
      assertKnownFlags(args as Record<string, unknown>, argsDef, `${spec.entity} get`);
      const id = String(args.id);

      try {
        const config = await resolveConfig();
        const supabase = createSupabaseClient(config);
        const record = await spec.fetch(supabase, id, config.brewGuideUserId);

        if (!record) {
          await logger.error(`${spec.label} ${id} not found`);
          exitWithError(`${spec.label} ${id} not found.`, EXIT.FAILURE);
        }

        spec.guard?.(record);

        const imageFields = spec.imageFields ?? [];
        const withImages = (args as Record<string, unknown>)['with-images'] === true;
        const flat = record as unknown as Record<string, unknown>;

        if (args.format === 'json') {
          printJson(withImages ? record : redactImages(flat, imageFields));
        } else {
          const lines = spec.describe(record);
          const images = describeImages(flat, imageFields);
          if (images.length > 0 && !withImages) lines.push(`Images:      ${images[0]}${OMITTED_HINT}`);
          console.log(lines.join('\n'));
        }

        await logger.success();
      } catch (error) {
        await logger.error(error);
        exitForError(error);
      }
    },
  });
}

export function createDeleteCommand(spec: EntityDeleteSpec) {
  const argsDef = {
    id: { type: 'positional', required: true, description: spec.idDescription },
    'dry-run': { type: 'boolean', description: 'Preview the operation without executing.' },
    format: { type: 'string' },
  } as const;

  return defineCommand({
    meta: {
      name: 'delete',
      description: spec.deleteDescription,
    },
    args: argsDef,
    async run({ args }) {
      const logger = createCommandLogger([spec.entity, 'delete'], args as Record<string, unknown>);
      assertKnownFlags(args as Record<string, unknown>, argsDef, `${spec.entity} delete`);

      if (args['dry-run']) {
        if (args.format === 'json') {
          printJson({ dryRun: true, action: 'delete', id: args.id });
        } else {
          console.log(`[dry-run] Would delete ${spec.entity} ${args.id}`);
        }
        await logger.success();
        return;
      }

      try {
        const config = await resolveConfig();
        const supabase = createSupabaseClient(config);
        const deleted = await spec.remove(supabase, args.id, config.brewGuideUserId);

        if (!deleted) {
          await logger.error(`${spec.label} ${args.id} not found`);
          exitWithError(`${spec.label} ${args.id} not found.`, EXIT.FAILURE);
        }

        if (args.format === 'json') {
          printJson({ deleted: args.id });
        } else {
          console.log(`Deleted ${spec.entity} ${args.id}`);
        }

        await logger.success();
      } catch (error) {
        await logger.error(error);
        exitForError(error);
      }
    },
  });
}


