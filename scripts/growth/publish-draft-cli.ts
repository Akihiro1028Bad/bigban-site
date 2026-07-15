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
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getColumnSlugs } from "../../src/lib/microcms/columnsQueries";
import { getNewsSlugs } from "../../src/lib/microcms/queries";
import { summarizeStyleWarnings } from "../../src/app/growth/approve/draftQuality";

import {
  bodyImageFileStem,
  buildBodyImageFailureMessage,
  buildBodyImageSpec,
  capBodyImageSpecs,
  normalizeBodyImageStyle,
  resolveBodyImages,
  substituteBodyImages,
  type BodyImageFailure,
  type BodyImageSpec,
  type BodyImageStyle,
} from "./body-image";
import { createDraft, patchDraft, resolveRetryConfig } from "./content";
import {
  buildDraftFailureMessage,
  classifyDraftFailure,
} from "./draft-notify";
import { fetchContentSlug, fetchDraftKey } from "./draft-meta";
import {
  growthEndpoint,
  growthMediaForRow,
  normalizeColumnsSelectFields,
  type GrowthMedia,
} from "./endpoint";
import { buildEyecatchPrompt, generateEyecatch, generateImage } from "./eyecatch";
import { defaultFetch } from "./http";
import { knownArticlePathsForMedia } from "./knownArticlePaths";
import { pushTextMessage } from "./line";
import { uploadMedia } from "./media";
import {
  buildBodyMirrorProps,
  buildDraftLinkProps,
  buildEyecatchMirrorProps,
  getPage,
  updatePageProps,
} from "./notion";
import {
  failureSignature,
  shouldSendFailureNotice,
  type NotifyThrottleRecord,
} from "./notify-throttle";
import {
  buildSourceLedgerProps,
  confirmedFactsFromEntries,
  hasReferenceEligibleSource,
  parseSourceLedger,
  updatePagePropsWithLedgerFallback,
} from "./sourceLedger";
import { evaluateOutlineCompliance, outlineFromPage } from "./outlineCompliance";
import { createSpecHash, runStages, type PipelineCheckpoint, type Stage } from "./pipeline";
import { buildGrowthOperationResult } from "./operationOutcome";
import { diagnosticDetail } from "./externalApiError";
import {
  buildRebuildSourceClearProps,
  preserveRebuildSourceSlug,
  rebuildSourceIdOf,
  validatedRebuildSourceId,
} from "./rebuildDraft";
import { evaluatePublishGate, resolveGateArticleType } from "./publishGate";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REF = path.join(here, "assets", "mascot-alien.png");

const NOTIFY_THROTTLE_PATH = ".growth-tmp/notify-throttle.json";
const DEFAULT_NOTIFY_WINDOW_MS = 10 * 60 * 1000;

// 状態ファイルは fail-open: 読めない/壊れていれば「空＝必ず送信」に倒す(沈黙を避ける)。
async function readThrottleRecords(): Promise<NotifyThrottleRecord[]> {
  try {
    const raw = await readFile(NOTIFY_THROTTLE_PATH, "utf-8");
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? (data as NotifyThrottleRecord[]) : [];
  } catch {
    return [];
  }
}

interface DraftImageInput {
  index: number;
  style: BodyImageStyle;
  description: string;
  textSpec?: string;
}

interface DraftSpec {
  payload: Record<string, unknown>;
  /**
   * 媒体軸(#media)。記事ネタ案 `媒体` プロパティの表示名(`ニュース`/`コラム`)。
   * `ニュース` → 公開先 news(env 無視)/ それ以外・欠落 → column(env 従属・従来挙動)。
   * 欠落時は column にフォールバックするため既存 spec は挙動不変(完全後方互換)。
   */
  media?: string;
  eyecatchAction?: string;
  imagePath?: string;
  /** 本文画像(#63)。構成案の画像指示から下書きモードがステージする。 */
  images?: DraftImageInput[];
  notion?: { pageId: string; property: string; value: string };
  /** 根拠台帳(#根拠台帳)。読者非公開・監査用に Notion 行へ保存する(任意・欠落耐性)。 */
  sourceLedger?: unknown;
}

/** best-effort で LINE に通知する(送れなくても失敗にしない=沈黙させない補助)。 */
async function notifyLineBestEffort(message: string): Promise<void> {
  const lineGroupId = process.env.LINE_GROUP_ID;
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!lineGroupId || !lineToken) return;
  try {
    await pushTextMessage(lineGroupId, message, {
      channelAccessToken: lineToken,
      fetchFn: defaultFetch,
    });
  } catch {
    /* 通知失敗は致命ではない(本処理は継続) */
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const specPath = process.argv[2];
  if (!specPath) throw new Error("使い方: publish-draft -- <spec.json>");
  const specRaw = await readFile(specPath, "utf-8");
  const spec = JSON.parse(specRaw) as DraftSpec;
  const stateDirectory = path.dirname(specPath);
  const checkpointPath = path.join(stateDirectory, "publish-checkpoint.json");
  const outcomePath = path.join(stateDirectory, "publish-outcome.json");
  const specHash = createSpecHash(specRaw);
  const atomicJson = async (filePath: string, value: unknown): Promise<void> => {
    const temporary = `${filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    await rename(temporary, filePath);
  };
  let checkpoint: PipelineCheckpoint | null = null;
  try {
    const parsed: unknown = JSON.parse(await readFile(checkpointPath, "utf-8"));
    if (parsed && typeof parsed === "object") checkpoint = parsed as PipelineCheckpoint;
  } catch {
    checkpoint = null;
  }

  // 媒体軸(#media): 行の `媒体` で公開先を出し分ける。欠落=column=従来の env 従属。
  const media: GrowthMedia = growthMediaForRow(spec.media);
  const ENDPOINT = growthEndpoint(media);

  const serviceDomain = requireEnv("MICROCMS_SERVICE_DOMAIN");
  const contentKey = requireEnv("MICROCMS_API_KEY");
  const microOpts = {
    serviceDomain,
    apiKey: contentKey,
    fetchFn: defaultFetch,
    // #58: タイムアウト/試行回数を env で上書き可能(既定は DEFAULT_RETRY)。
    retry: resolveRetryConfig(process.env),
  };

  const imagePath = spec.imagePath ?? "/tmp/growth-eyecatch.png";
  let contentId = "";
  let eyecatchUrl = "";

  // 本文画像1枚を「生成(キャッシュ)→microCMSへupload」して URL を返す(#63)。
  // 生成済みファイルがあれば再生成しない(冪等=#21・OpenAI の再課金防止)。mascot のみ参照画像。
  async function resolveBodyImageUrl(imgSpec: BodyImageSpec): Promise<string> {
    const filePath = path.join(os.tmpdir(), `${bodyImageFileStem(String(spec.payload.slug ?? ""), imgSpec)}.png`);
    if (!existsSync(filePath)) {
      const buf = await generateImage(
        {
          apiKey: requireEnv("OPENAI_API_KEY"),
          prompt: imgSpec.prompt,
          size: "1536x1024",
          quality: "high",
          refPath: imgSpec.style === "mascot" ? DEFAULT_REF : undefined,
        },
        { fetchFn: defaultFetch, readFile }
      );
      await writeFile(filePath, buf);
    }
    return uploadMedia(filePath, {
      serviceDomain,
      apiKey: requireEnv("MICROCMS_API_KEY"),
      fetchFn: defaultFetch,
      readFile,
    });
  }

  const stages: Stage[] = [];
  const parsedLedger = parseSourceLedger(spec.sourceLedger);
  let rebuildSourceId = "";

  // Notion連携のある通常フローでは、承認済み構成案と再生成元情報を投入前に読み直す。
  // notion無しの手動specは後方互換でスキップする。
  if (spec.notion) {
    stages.push({
      name: "notion-context",
      restore: (output) => {
        if (!output || typeof output !== "object") return;
        const saved = output as { rebuildSourceId?: unknown; payload?: unknown };
        if (typeof saved.rebuildSourceId === "string") rebuildSourceId = saved.rebuildSourceId;
        if (saved.payload && typeof saved.payload === "object") spec.payload = saved.payload as Record<string, unknown>;
      },
      run: async () => {
        const page = await getPage(spec.notion!.pageId, {
          token: requireEnv("NOTION_TOKEN"),
          fetchFn: defaultFetch,
        });
        const outlineGate = evaluateOutlineCompliance(
          outlineFromPage(page),
          String(spec.payload.bodyHtml ?? ""),
          { allowGeneratedReferences: hasReferenceEligibleSource(parsedLedger.entries) }
        );
        if (!outlineGate.ok) {
          throw new Error(`構成案ゲート不合格(投入中断): ${outlineGate.blockReasons.join(" / ")}`);
        }
        rebuildSourceId = validatedRebuildSourceId(rebuildSourceIdOf(page)) ?? "";
        if (rebuildSourceId !== "") {
          const metaOptions = {
            serviceDomain,
            apiKey: requireEnv("MICROCMS_API_KEY"),
            fetchFn: defaultFetch,
          };
          const sourceDraftKey = await fetchDraftKey(
            ENDPOINT,
            rebuildSourceId,
            metaOptions
          );
          if (sourceDraftKey === null) {
            throw new Error("再生成元下書きのdraftKeyを取得できませんでした");
          }
          const sourceSlug = await fetchContentSlug(
            ENDPOINT,
            rebuildSourceId,
            sourceDraftKey,
            metaOptions
          );
          spec.payload = preserveRebuildSourceSlug(spec.payload, sourceSlug);
        }
        return { rebuildSourceId, payload: spec.payload };
      },
    });
  }

  // 品質ゲート(P1-B 案B): 投入前に draftQuality の block を判定し、1つでもあれば中断する。
  // 画像生成や microCMS 投入の前に止めることで、不合格の下書きを作らず API 課金も無駄にしない。
  // block 例: §5 AI免責文欠落 / 明確な禁止表現 / 危険HTML / §15 壊れ内部リンク。
  // slug 取得失敗時はリンク検査だけを従来動作にフォールバックし、投入自体は止めない。
  // gate 不合格の失敗は既存の failedAt 経路で LINE 通知される。
  stages.push({
    name: "quality-gate",
    run: async () => {
      let knownNewsPaths: ReadonlySet<string> | undefined;
      try {
        const paths = await knownArticlePathsForMedia(media, {
          getColumnSlugs,
          getNewsSlugs,
        });
        knownNewsPaths = new Set(paths);
      } catch (error: unknown) {
        knownNewsPaths = undefined;
        const msg = `品質ゲート: 既知記事パスの取得に失敗。壊れリンク検査をスキップして続行します: ${errorMessage(error)}`;
        process.stderr.write(`${msg}\n`);
        await notifyLineBestEffort(msg);
      }
      const gate = evaluatePublishGate({
        bodyHtml: String(spec.payload.bodyHtml ?? ""),
        title: String(spec.payload.title ?? ""),
        articleType: resolveGateArticleType(spec.payload),
        knownNewsPaths,
        confirmedFacts: confirmedFactsFromEntries(parsedLedger.entries),
      });
      if (!gate.ok) {
        throw new Error(`品質ゲート不合格(投入中断): ${gate.blockReasons.join(" / ")}`);
      }
      const styleWarn = summarizeStyleWarnings(
        String(spec.payload.bodyHtml ?? ""),
        String(spec.payload.title ?? "")
      );
      if (styleWarn) {
        const msg = `文体チェック(要確認・投入は継続): ${String(spec.payload.title ?? "")} / ${styleWarn}`;
        process.stderr.write(`${msg}\n`);
        await notifyLineBestEffort(msg);
      }
    },
  });

  // 本文画像(#63): create より前に、生成→upload→{{IMG:n}} 置換で bodyHtml を確定させる。
  // 1枚失敗しても全体は止めず、そのプレースホルダは除去・スキップを LINE 通知する。
  if (spec.images && spec.images.length > 0) {
    const inputs = spec.images;
    stages.push({
      name: "body-images",
      restore: (output) => {
        if (output && typeof output === "object" && typeof (output as { bodyHtml?: unknown }).bodyHtml === "string") {
          spec.payload.bodyHtml = (output as { bodyHtml: string }).bodyHtml;
        }
      },
      run: async () => {
        // spec.json は未検証 JSON。旧値(minimal/diagram 等)や未知値が来ても
        // 落とさず新6語彙へ正規化してから spec を組む(#P2 レビュー Important)。
        // 正規化後の style は imgSpec.style として resolveBodyImageUrl の
        // mascot 参照画像分岐(refPath)でも使われるため、ここで確定させる。
        const allSpecs = inputs.map((im) =>
          buildBodyImageSpec(im.index, normalizeBodyImageStyle(im.style), im.description, im.textSpec)
        );
        const { kept, dropped } = capBodyImageSpecs(allSpecs);
        const { resolved, failures } = await resolveBodyImages(kept, resolveBodyImageUrl);
        spec.payload.bodyHtml = substituteBodyImages(
          String(spec.payload.bodyHtml ?? ""),
          resolved
        );
        const droppedFailures: BodyImageFailure[] = dropped.map((d) => ({
          index: d.index,
          description: d.description,
          error: "1記事の上限(3枚)を超えたためスキップ",
        }));
        const allFailures = [...failures, ...droppedFailures];
        if (allFailures.length > 0) {
          const msg = buildBodyImageFailureMessage(String(spec.payload.title ?? ""), allFailures);
          process.stderr.write(`${msg}\n`);
          await notifyLineBestEffort(msg);
        }
        return { bodyHtml: String(spec.payload.bodyHtml ?? "") };
      },
    });
  }

  stages.push({
    name: "create",
    restore: (output) => {
      if (output && typeof output === "object" && typeof (output as { contentId?: unknown }).contentId === "string") {
        contentId = (output as { contentId: string }).contentId;
      }
    },
    run: async () => {
      // Bug1: columns の articleType(kind=select)は配列を要求する。LLM が文字列で
      // 吐いても初回 create が HTTP 400 で落ちないよう、投入直前に配列へ矯正する。
      const createPayload = normalizeColumnsSelectFields(ENDPOINT, spec.payload);
      contentId = await createDraft(
        ENDPOINT,
        createPayload,
        microOpts,
        rebuildSourceId || undefined
      );
      return { contentId };
    },
  });

  if (spec.eyecatchAction) {
    stages.push(
      {
        name: "eyecatch:generate",
        run: async () => {
          const buf = await generateEyecatch(
            {
              apiKey: requireEnv("OPENAI_API_KEY"),
              refPath: DEFAULT_REF,
              // #163: 記事タイトルを渡し、アイキャッチ原本の余白にタイトル(日本語)を焼き込む。
              prompt: buildEyecatchPrompt(
                spec.eyecatchAction as string,
                String(spec.payload.title ?? "")
              ),
              size: "1536x1024",
              quality: "high",
            },
            { fetchFn: defaultFetch, readFile }
          );
          await writeFile(imagePath, buf);
          return { imagePath };
        },
      },
      {
        name: "eyecatch:upload",
        restore: (output) => {
          if (output && typeof output === "object" && typeof (output as { eyecatchUrl?: unknown }).eyecatchUrl === "string") {
            eyecatchUrl = (output as { eyecatchUrl: string }).eyecatchUrl;
          }
        },
        run: async () => {
          eyecatchUrl = await uploadMedia(imagePath, {
            serviceDomain,
            apiKey: requireEnv("MICROCMS_API_KEY"),
            fetchFn: defaultFetch,
            readFile,
          });
          return { eyecatchUrl };
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
        // #73: 承認画面が下書きを特定できるよう contentId + draftKey も保存する。
        // draftKey は管理APIから best-effort で取得(失敗しても contentId とステータスは保存)。
        let draftKey: string | null = null;
        try {
          draftKey = await fetchDraftKey(ENDPOINT, contentId, {
            serviceDomain,
            apiKey: requireEnv("MICROCMS_API_KEY"),
            fetchFn: defaultFetch,
          });
        } catch (error: unknown) {
          const m = error instanceof Error ? error.message : String(error);
          process.stderr.write(`(draftKey 取得に失敗・プレビューキーなしで継続: ${m})\n`);
        }
        // #根拠台帳: 台帳を検証し、除外があれば沈黙させず LINE 通知する(投入は落とさない)。
        const { entries: ledgerEntries, warnings: ledgerWarnings } = parsedLedger;
        for (const w of ledgerWarnings) {
          process.stderr.write(`${w}\n`);
          await notifyLineBestEffort(w);
        }

        const notionOpts = { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
        const baseProps: Record<string, unknown> = {
          [notion.property]: { select: { name: notion.value } },
          ...buildDraftLinkProps(contentId, draftKey),
          // #95: 公開キーで下書きを読まない方針のため、確定本文HTML(画像置換後)を
          // Notion にミラーし、承認画面のプレビューはこの値を読む。
          ...buildBodyMirrorProps(String(spec.payload.bodyHtml ?? "")),
          // #141: アイキャッチURLも Notion へミラーし、承認画面のプレビューが表示できるようにする。
          ...buildEyecatchMirrorProps(eyecatchUrl),
          ...(rebuildSourceId !== "" ? buildRebuildSourceClearProps() : {}),
        };
        // #根拠台帳: 同じ PATCH に台帳をマージして保存する(API 呼び出しを増やさない)。
        // 「根拠台帳」プロパティ未追加でも本体保存は成功させる(欠落耐性=台帳抜きでリトライ)。
        const ledgerResult = await updatePagePropsWithLedgerFallback({
          baseProps,
          ledgerProps: buildSourceLedgerProps(ledgerEntries),
          update: (props) => updatePageProps(notion.pageId, props, notionOpts),
        });
        if (ledgerResult.warning) {
          process.stderr.write(`${ledgerResult.warning}\n`);
          await notifyLineBestEffort(ledgerResult.warning);
        }
      },
    });
  }

  const result = await runStages(stages, (m) => process.stdout.write(`${m}\n`), {
    specHash,
    checkpoint,
    onCheckpoint: (next) => atomicJson(checkpointPath, next),
  });

  if (result.failedAt) {
    const resumeCommand = spec.notion
      ? `npm run growth:draft-orchestrator -- ${spec.notion.pageId}`
      : `npm run growth:publish-draft -- ${specPath}`;
    const isPartial = result.completed.includes("create") && result.failedAt.name === "notion:update";
    const safeDetail = diagnosticDetail(result.failedAt.error, {
      secrets: [process.env.MICROCMS_API_KEY ?? "", process.env.NOTION_TOKEN ?? "", process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ""],
    });
    const outcome = buildGrowthOperationResult({
      outcome: isPartial ? "partial" : "retryable-failure",
      message: isPartial
        ? `microCMS投入は完了しましたが ${result.failedAt.name} に失敗しました。`
        : `投入工程 ${result.failedAt.name} に失敗しました。`,
      completedStages: result.completed,
      failedStage: result.failedAt.name,
      events: result.events,
      externalIds: { ...(contentId ? { contentId } : {}), ...(spec.notion ? { notionPageId: spec.notion.pageId } : {}) },
      recovery: { retryable: true, resumeFrom: result.failedAt.name, command: resumeCommand },
    });
    await atomicJson(outcomePath, outcome);
    process.stdout.write(`growthOutcome=${JSON.stringify(outcome)}\n`);
    if (isPartial) {
      process.stderr.write(`部分成功: ${result.failedAt.name}: ${safeDetail}\n再開: ${resumeCommand}\n`);
      if (contentId) process.stdout.write(`contentId=${contentId}\n`);
      process.exitCode = 0;
      return;
    }
    const category = classifyDraftFailure(result.failedAt.error);
    const failureMessage = buildDraftFailureMessage({
      failedStage: result.failedAt.name,
      error: result.failedAt.error,
      specPath,
      category,
    });
    process.stderr.write(`${failureMessage}\n`);

    // #58: 同種失敗(工程+分類)の連続通知を一定ウィンドウ内で1通に集約する。
    const windowEnv = Number(process.env.GROWTH_NOTIFY_WINDOW_MS);
    const windowMs =
      Number.isInteger(windowEnv) && windowEnv > 0
        ? windowEnv
        : DEFAULT_NOTIFY_WINDOW_MS;
    const signature = failureSignature(result.failedAt.name, category);
    const records = await readThrottleRecords();
    const decision = shouldSendFailureNotice(records, signature, Date.now(), windowMs);
    // .growth-tmp/ が無いとスロットル状態を保存できず毎回送信になるため先に作る。
    await mkdir(path.dirname(NOTIFY_THROTTLE_PATH), { recursive: true }).catch(() => {});
    await writeFile(NOTIFY_THROTTLE_PATH, JSON.stringify(decision.records), "utf-8").catch(
      () => {}
    );

    // 沈黙させない(#24): 失敗を LINE へ best-effort 通知。送信不可でも失敗終了は維持。
    const lineGroupId = process.env.LINE_GROUP_ID;
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!decision.send) {
      process.stderr.write(
        `(同種の失敗を直近に通知済みのため LINE 通知を集約しました: ${signature})\n`
      );
    } else if (lineGroupId && lineToken) {
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

  const outcome = buildGrowthOperationResult({
    outcome: "success",
    message: "下書き投入が完了しました。",
    completedStages: result.completed,
    events: result.events,
    externalIds: { ...(contentId ? { contentId } : {}), ...(eyecatchUrl ? { assetUrl: eyecatchUrl } : {}), ...(spec.notion ? { notionPageId: spec.notion.pageId } : {}) },
  });
  await atomicJson(outcomePath, outcome);
  await unlink(checkpointPath).catch(() => {});
  process.stdout.write(`growthOutcome=${JSON.stringify(outcome)}\n`);
  process.stdout.write(`contentId=${contentId}\n`);
  if (eyecatchUrl) process.stdout.write(`eyecatch=${eyecatchUrl}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`投入パイプラインの起動に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
