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
import { printJson } from './output.ts';

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
}

export interface EntityDeleteSpec extends EntitySpec {
  deleteDescription: string;
  remove: (supabase: SupabaseClient, id: string, userId: string) => Promise<boolean>;
}

export function createGetCommand<T>(spec: EntityGetSpec<T>) {
  const argsDef = {
    id: { type: 'positional', required: true, description: spec.idDescription },
    format: { type: 'string' },
  } as const;

  return defineCommand({
    meta: {
      name: 'get',
      description: spec.getDescription,
    },
    args: argsDef,
    async run({ args }) {
      const logger = createCommandLogger([spec.entity, 'get'], args as Record<string, unknown>);
      assertKnownFlags(args as Record<string, unknown>, argsDef, `${spec.entity} get`);

      try {
        const config = await resolveConfig();
        const supabase = createSupabaseClient(config);
        const record = await spec.fetch(supabase, args.id, config.brewGuideUserId);

        if (!record) {
          await logger.error(`${spec.label} ${args.id} not found`);
          exitWithError(`${spec.label} ${args.id} not found.`, EXIT.FAILURE);
        }

        if (args.format === 'json') {
          printJson(record);
        } else {
          console.log(spec.describe(record).join('\n'));
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


