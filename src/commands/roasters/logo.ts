import { defineCommand } from 'citty';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../../client.ts';
import { resolveConfig } from '../../config.ts';
import { createCommandLogger } from '../../logger.ts';
import { assertKnownFlags } from '../../lib/args.ts';
import { EXIT, exitForError, exitWithError } from '../../lib/exit.ts';
import { formatBytes, readImageAsDataUrl } from '../../lib/imageFile.ts';
import { ROASTER_LOGO_POLICY } from '../../lib/imagePolicy.ts';
import { imageDataUrlBytes } from '../../lib/images.ts';
import { printJson, warn } from '../../lib/output.ts';
import {
  describeRoasterLogo,
  listRoasterLogos,
  withRoasterLogo,
} from '../../lib/roasterLogo.ts';
import { MissingRoastersFunctionError } from '../../lib/roastersSql.ts';
import { listRoasters } from '../../services/roasters.ts';
import { fetchSettingsRow, updateSettingsData } from '../../services/settings.ts';

const argsDef = {
  name: {
    type: 'string',
    description: '烘焙商名称（要和豆子里的 roaster 完全一致）。不给就列出已经配好图标的烘焙商。',
  },
  image: {
    type: 'string',
    description: '图标文件（.png / .jpg / .webp）。按 App 口径压到 0.12 MB / 512px 以内再传，CLI 不压缩。',
  },
  clear: {
    type: 'boolean',
    default: false,
    description: '删掉这个烘焙商的图标（与 --image 二选一）。',
  },
  force: {
    type: 'boolean',
    default: false,
    description: '名字不在现有烘焙商列表里也照写。',
  },
  'dry-run': { type: 'boolean', default: false },
  format: { type: 'string' },
} as const;

function describeTimestamp(ms: number | undefined): string {
  return ms === undefined ? '' : `, updated ${new Date(ms).toISOString()}`;
}

/**
 * 名字对不上是这类命令最常见的错：写错一个字不会报错，但图标永远不会在 App 里出现。
 * 所以先跟 `get_all_roasters()` 的名单比一遍；RPC 不存在（新项目还没建）就只提醒不拦。
 */
async function assertKnownRoaster(supabase: SupabaseClient, roasterName: string): Promise<void> {
  let known: string[];
  try {
    known = await listRoasters(supabase);
  } catch (error) {
    if (error instanceof MissingRoastersFunctionError) {
      warn(
        '提示：这个库里没有 public.get_all_roasters()，跳过烘焙商名称校验（图标仍然会写入）。' +
          '建这个函数的方法见 README。',
      );
      return;
    }
    throw error;
  }

  if (known.includes(roasterName)) return;

  const available = known.length > 0 ? known.join(' / ') : '（空）';
  exitWithError(
    `Error: 没有烘焙商 "${roasterName}"。现有的：${available}。` +
      '名字要和豆子里的 roaster 完全一致；确实要先建图标的话加 --force。',
    EXIT.USAGE,
  );
}

export default defineCommand({
  meta: {
    name: 'logo',
    description: "Set, clear or inspect a roaster's logo (stored in user_settings).",
  },
  args: argsDef,
  async run({ args }) {
    const logger = createCommandLogger(['roasters', 'logo'], args as Record<string, unknown>);
    assertKnownFlags(args as Record<string, unknown>, argsDef, 'roasters logo');

    const dryRun = args['dry-run'] === true;
    const jsonFormat = args.format === 'json';
    const nameArg = typeof args.name === 'string' ? args.name.trim() : '';
    const imageArg = typeof args.image === 'string' ? args.image.trim() : '';
    const clear = args.clear === true;

    if (imageArg && clear) {
      exitWithError('Error: --image 和 --clear 只能二选一。', EXIT.USAGE);
    }
    if (!nameArg && (imageArg || clear)) {
      exitWithError('Error: 用 --image / --clear 时必须用 --name 指定烘焙商。', EXIT.USAGE);
    }
    if (dryRun && !nameArg) {
      exitWithError('Error: --dry-run 要配合 --name 使用（列图标不需要预览）。', EXIT.USAGE);
    }

    // 文件先读成 data URL：读不到、太大、格式不认，都在联网之前就报出来。
    let logoData: string | null = null;
    if (imageArg) {
      try {
        logoData = readImageAsDataUrl(imageArg, { flag: '--image', policy: ROASTER_LOGO_POLICY });
      } catch (error) {
        exitWithError(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
          EXIT.USAGE,
        );
      }
    }
    const logoBytes = logoData === null ? undefined : imageDataUrlBytes(logoData);

    if (dryRun) {
      if (jsonFormat) {
        printJson({
          dryRun: true,
          roaster: nameArg,
          action: clear ? 'clear' : 'set',
          ...(logoBytes === undefined ? {} : { logoBytes }),
        });
        await logger.success();
        return;
      }

      console.log(
        clear
          ? `[dry-run] Would remove the logo of roaster ${nameArg}.`
          : `[dry-run] Would set the logo of roaster ${nameArg} (${formatBytes(logoBytes ?? 0)}).`,
      );
      await logger.success();
      return;
    }

    try {
      const config = await resolveConfig();
      const supabase = createSupabaseClient(config);

      // 没给 --name：列出已有的图标。
      if (!nameArg) {
        const row = await fetchSettingsRow(supabase, config.brewGuideUserId);
        const logos = listRoasterLogos(row ? row.data.appSettings : undefined);

        if (jsonFormat) {
          printJson(logos);
          await logger.success();
          return;
        }
        if (logos.length === 0) {
          console.log(
            'No roaster logos configured. Add one with: brew-guide roasters logo --name <roaster> --image <file>',
          );
          await logger.success();
          return;
        }
        for (const entry of logos) {
          console.log(
            `${entry.roasterName}  ${formatBytes(entry.logoBytes)}${describeTimestamp(entry.logoUpdatedAt)}`,
          );
        }
        await logger.success();
        return;
      }

      if (!clear && args.force !== true) {
        await assertKnownRoaster(supabase, nameArg);
      }

      const row = await fetchSettingsRow(supabase, config.brewGuideUserId);
      if (!row) {
        exitWithError(
          'Error: 这个库里还没有 user_settings 行（App 里打开一次设置并保存即可建出来）。',
          EXIT.FAILURE,
        );
      }

      const current = describeRoasterLogo(row.data.appSettings, nameArg);

      // 只看状态：没给 --image 也没给 --clear。
      if (!logoData && !clear) {
        if (jsonFormat) {
          printJson({ roaster: nameArg, ...current });
          await logger.success();
          return;
        }
        console.log(
          current.hasLogo
            ? `Roaster ${nameArg}: logo ${formatBytes(current.logoBytes ?? 0)}${describeTimestamp(current.logoUpdatedAt)}.`
            : `Roaster ${nameArg}: no logo.`,
        );
        await logger.success();
        return;
      }

      // 删图标是幂等的：本来就没有图标就不写库（省一次没必要的 updated_at 变化）。
      if (clear && !current.hasLogo) {
        if (jsonFormat) {
          printJson({ roaster: nameArg, action: 'clear', changed: false });
          await logger.success();
          return;
        }
        console.log(`Roaster ${nameArg} has no logo; nothing to clear.`);
        await logger.success();
        return;
      }

      const write = withRoasterLogo(row.data.appSettings, nameArg, clear ? null : logoData);
      await updateSettingsData(
        supabase,
        config.brewGuideUserId,
        { ...row.data, appSettings: write.appSettings },
        row.updated_at,
      );

      if (jsonFormat) {
        printJson({
          roaster: nameArg,
          action: clear ? 'clear' : 'set',
          ...(logoBytes === undefined ? {} : { logoBytes }),
          logoUpdatedAt: write.logoUpdatedAt,
        });
        await logger.success();
        return;
      }

      console.log(
        clear
          ? `Removed the logo of roaster ${nameArg}.`
          : `Set the logo of roaster ${nameArg} (${formatBytes(logoBytes ?? 0)}).`,
      );
      await logger.success();
    } catch (error) {
      await logger.error(error);
      exitForError(error);
    }
  },
});
