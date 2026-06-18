/**
 * 下書き投入の決定的パイプライン実行入口(#23)。
 *
 *   npm run growth:publish-draft -- <spec.json>
 *
 * spec.json(エージェントが .growth-tmp 等にステージする):
 *   {
 *     "payload": { title, slug, locale, category, displayMode, excerpt, bodyHtml, ... },
 *     "eyecatchAction": "<英語の行為>",            // 宇宙人マスコットの行為(§9)
 *     "imagePath": "/tmp/growth-eyecatch.png",     // 任意。アイキャッチ生成物の保存先
 *     "notion": { "pageId": "...", "property": "ステータス", "value": "下書き作成済み" } // 任意
 *   }
 *
 * create→(eyecatch 生成→upload→patch)→Notion更新 を **同期・直列**で実行する。
 * 背景タスク化せずこのプロセス内で完結するため、エージェントの完了待ちストールが起きない。
 * 失敗時はどの工程で落ちたかを stderr に出し、終了コード 1 で抜ける(#24で LINE通知を追加)。
 * 薄い配線のためテスト対象外(順次実行ロジックは pipeline.ts でテスト済み)。
 */

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDraft, patchDraft } from "./content";
import { buildDraftFailureMessage } from "./draft-notify";
import { buildEyecatchPrompt, generateEyecatch } from "./eyecatch";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import { uploadMedia } from "./media";
import { updatePageSelect } from "./notion";
import { runStages, type Stage } from "./pipeline";

const ENDPOINT = "news";
const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REF = path.join(here, "assets", "mascot-alien.png");

interface DraftSpec {
  payload: Record<string, unknown>;
  eyecatchAction?: string;
  imagePath?: string;
  notion?: { pageId: string; property: string; value: string };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

async function main(): Promise<void> {
  const specPath = process.argv[2];
  if (!specPath) throw new Error("使い方: publish-draft -- <spec.json>");
  const spec = JSON.parse(await readFile(specPath, "utf-8")) as DraftSpec;

  const serviceDomain = requireEnv("MICROCMS_SERVICE_DOMAIN");
  const contentKey =
    process.env.MICROCMS_CONTENT_API_KEY ??
    requireEnv("MICROCMS_MANAGEMENT_API_KEY");
  const microOpts = { serviceDomain, apiKey: contentKey, fetchFn: defaultFetch };

  const imagePath = spec.imagePath ?? "/tmp/growth-eyecatch.png";
  let contentId = "";
  let eyecatchUrl = "";

  const stages: Stage[] = [
    {
      name: "create",
      run: async () => {
        contentId = await createDraft(ENDPOINT, spec.payload, microOpts);
      },
    },
  ];

  if (spec.eyecatchAction) {
    stages.push(
      {
        name: "eyecatch:generate",
        run: async () => {
          const buf = await generateEyecatch(
            {
              apiKey: requireEnv("OPENAI_API_KEY"),
              refPath: DEFAULT_REF,
              prompt: buildEyecatchPrompt(spec.eyecatchAction as string),
              size: "1536x1024",
              quality: "high",
            },
            { fetchFn: defaultFetch, readFile }
          );
          await writeFile(imagePath, buf);
        },
      },
      {
        name: "eyecatch:upload",
        run: async () => {
          eyecatchUrl = await uploadMedia(imagePath, {
            serviceDomain,
            apiKey: requireEnv("MICROCMS_MANAGEMENT_API_KEY"),
            fetchFn: defaultFetch,
            readFile,
          });
        },
      },
      {
        name: "eyecatch:patch",
        run: async () => {
          await patchDraft(ENDPOINT, contentId, { eyecatch: eyecatchUrl }, microOpts);
        },
      }
    );
  }

  if (spec.notion) {
    const notion = spec.notion;
    stages.push({
      name: "notion:update",
      run: async () => {
        await updatePageSelect(notion.pageId, notion.property, notion.value, {
          token: requireEnv("NOTION_TOKEN"),
          fetchFn: defaultFetch,
        });
      },
    });
  }

  const result = await runStages(stages, (m) => process.stdout.write(`${m}\n`));

  if (result.failedAt) {
    const failureMessage = buildDraftFailureMessage({
      failedStage: result.failedAt.name,
      error: result.failedAt.error,
      specPath,
    });
    process.stderr.write(`${failureMessage}\n`);
    // 沈黙させない(#24): 失敗を LINE へ best-effort 通知。送信不可でも失敗終了は維持。
    const lineGroupId = process.env.LINE_GROUP_ID;
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (lineGroupId && lineToken) {
      try {
        await pushTextMessage(lineGroupId, failureMessage, {
          channelAccessToken: lineToken,
          fetchFn: defaultFetch,
        });
      } catch (notifyError: unknown) {
        const m =
          notifyError instanceof Error ? notifyError.message : String(notifyError);
        process.stderr.write(`(失敗の LINE 通知も送れませんでした: ${m})\n`);
      }
    } else {
      process.stderr.write(
        "(LINE 未設定のため失敗通知は送れません: LINE_GROUP_ID / LINE_CHANNEL_ACCESS_TOKEN)\n"
      );
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`contentId=${contentId}\n`);
  if (eyecatchUrl) process.stdout.write(`eyecatch=${eyecatchUrl}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`投入パイプラインの起動に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
