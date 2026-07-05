/**
 * 本文画像 AI 再生成ループ(Epic #140 / #156)の決定的オペレーション CLI(headless poller 用)。
 *
 *   npm run growth:body-image-regen -- reap                              # 処理中のstale(>15分)を失敗に回収＋通知
 *   npm run growth:body-image-regen -- next                              # 依頼中を1件ロック(処理中)し JSON を標準出力
 *   npm run growth:body-image-regen -- done <pageId> <targetSrc|placeholderId> <url> [--alt <説明>] [--note <注記>]  # 生成画像URLで本文の当該画像を差し替え/挿入＋完了＋通知
 *   npm run growth:body-image-regen -- fail <pageId> <reason>            # 失敗にして理由＋通知
 *
 * claude(regen-body-image.md)は「指示→スタイル/説明を決めて gen-body-image / upload-media を回す」
 * 創作部分だけを担い、Notion 書き込み・本文HTML差し替え・patchDraft・通知・ロック・回収はこの CLI が
 * 決定的に行う。純ロジックは body-image-regen.ts でテスト済み。薄い配線のためカバレッジ対象外。
 * GROWTH_DRYRUN=1 では書き込み/送信せず内容を表示する。
 */

import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildBodyRegenDoneMessage,
  buildBodyRegenDoneFlex,
  buildBodyRegenDoneProps,
  buildBodyRegenFailMessage,
  buildBodyRegenFailProps,
  buildBodyRegenProcessingProps,
  bodyRegenRowFromPage,
  BODY_REGEN_PROPS,
  BODY_REGEN_TIMEOUT_MS,
  isMicrocmsAssetUrl,
  parseBodyRegenTarget,
  replaceBodyImageBySrc,
  replaceBodyImagePlaceholder,
  selectStaleBodyRegenIds,
} from "./body-image-regen";
import { bodyImageFigureHtml, isPlaceholderId } from "./body-image-insert";
import { patchDraft } from "./content";
import { growthEndpoint } from "./endpoint";
import type { FlexContainer } from "./digest-flex";
import { defaultFetch } from "./http";
import { appendLearningLog, buildLearningLogFailNotice } from "./learningLog";
import { pushFlexMessage, pushTextMessage } from "./line";
import {
  buildBodyMirrorProps,
  createPage,
  getPage,
  queryDataSource,
  updatePageProps,
  type NotionApiOptions,
} from "./notion";
import {
  failureSignature,
  shouldSendFailureNotice,
  type NotifyThrottleRecord,
} from "./notify-throttle";
import type { BodyRegenRow } from "./body-image-regen";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const ENDPOINT = growthEndpoint();
const REAP_REASON = "処理が15分以上完了しませんでした(PC再起動等の可能性)。もう一度再生成を依頼できます。";
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const PAGE_ID_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const WINDOW_MS = 30 * 60 * 1000;
const LEARNING_LOG_THROTTLE_STATE_PATH = ".growth-tmp/learning-log-notify.json";
// 差し替えに使えるのは microCMS のアセット URL のみ(任意 URL 書き込み防止)。判定は
// 純ロジックの isMicrocmsAssetUrl(URLパースでホスト厳密一致)で統一する(security M-1)。
// 前方一致の正規表現だと `images.microcms-assets.io.evil.example/` 等を弾けないため使わない。

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function assertPageId(id: string): string {
  if (!PAGE_ID_RE.test(id)) throw new Error(`不正な pageId: ${id}`);
  return id;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

function contentOptions(): { serviceDomain: string; apiKey: string; fetchFn: typeof defaultFetch } {
  return {
    serviceDomain: requireEnv("MICROCMS_SERVICE_DOMAIN"),
    // 下書きへの書き込みは content API キーに限定する(security H-1)。
    // 削除も可能な MANAGEMENT キーへはフォールバックしない(最小権限)。
    apiKey: requireEnv("MICROCMS_CONTENT_API_KEY"),
    fetchFn: defaultFetch,
  };
}

function approveUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return `${base}/growth/approve`;
}

function statusFilter(value: string): unknown {
  return { property: BODY_REGEN_PROPS.status, select: { equals: value } };
}

async function rowsByStatus(value: string, options: NotionApiOptions): Promise<BodyRegenRow[]> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: statusFilter(value), pageSize: 100 },
    options
  );
  return pages.map(bodyRegenRowFromPage);
}

async function notify(text: string): Promise<void> {
  if (DRYRUN) {
    process.stdout.write(`[dry-run] LINE:\n${text}\n`);
    return;
  }
  await pushTextMessage(requireEnv("LINE_GROUP_ID"), text, {
    channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    fetchFn: defaultFetch,
  });
}

/** 完了通知を Flex で送る(#162)。altText は Flex 非対応環境のフォールバック。 */
async function notifyFlex(altText: string, contents: FlexContainer): Promise<void> {
  if (DRYRUN) {
    process.stdout.write(`[dry-run] LINE(flex):\n${altText}\n`);
    return;
  }
  await pushFlexMessage(requireEnv("LINE_GROUP_ID"), altText, contents, {
    channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    fetchFn: defaultFetch,
  });
}

async function write(pageId: string, props: Record<string, unknown>, options: NotionApiOptions): Promise<void> {
  if (DRYRUN) {
    process.stdout.write(`[dry-run] PATCH ${pageId}: ${JSON.stringify(props)}\n`);
    return;
  }
  await updatePageProps(pageId, props, options);
}

function readThrottleRecords(): NotifyThrottleRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(LEARNING_LOG_THROTTLE_STATE_PATH, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): NotifyThrottleRecord[] => {
      if (
        item &&
        typeof item === "object" &&
        "signature" in item &&
        "sentAtMs" in item &&
        typeof item.signature === "string" &&
        typeof item.sentAtMs === "number"
      ) {
        return [{ signature: item.signature, sentAtMs: item.sentAtMs }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function writeThrottleRecords(records: readonly NotifyThrottleRecord[]): void {
  mkdirSync(dirname(LEARNING_LOG_THROTTLE_STATE_PATH), { recursive: true });
  writeFileSync(LEARNING_LOG_THROTTLE_STATE_PATH, `${JSON.stringify(records)}\n`);
}

async function notifyLearningLogFailThrottled(kind: string): Promise<void> {
  try {
    const signature = failureSignature("learning-log", kind);
    const decision = shouldSendFailureNotice(
      readThrottleRecords(),
      signature,
      Date.now(),
      WINDOW_MS
    );
    writeThrottleRecords(decision.records);
    if (!decision.send) return;

    const message = buildLearningLogFailNotice(kind);
    if (DRYRUN) {
      process.stdout.write(`[dry-run] LINE: ${message}\n`);
      return;
    }
    await pushTextMessage(requireEnv("LINE_GROUP_ID"), message, {
      channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
      fetchFn: defaultFetch,
    });
  } catch {
    // 学習ログ失敗通知はベストエフォート。本処理の exit には影響させない。
  }
}

async function countRecentImageAttempts(
  pageId: string,
  style: string,
  options: NotionApiOptions
): Promise<number> {
  const dataSourceId = process.env.GROWTH_LEARNING_LOG_DS;
  if (!dataSourceId) return 0;
  const cutoff = new Date(Date.now() - 4 * 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { pages } = await queryDataSource(
      dataSourceId,
      {
        filter: {
          and: [
            { property: "種別", select: { equals: "画像試行" } },
            { property: "ページID", rich_text: { contains: pageId } },
            { property: "対象", rich_text: { equals: style } },
            { property: "記録時刻", date: { on_or_after: cutoff } },
          ],
        },
        pageSize: 100,
      },
      options
    );
    return pages.length;
  } catch {
    return 0;
  }
}

async function recordImageAttempt(
  pageId: string,
  title: string,
  style: string,
  result: "成功" | "失敗",
  options: NotionApiOptions
): Promise<void> {
  try {
    const dataSourceId = process.env.GROWTH_LEARNING_LOG_DS;
    const attempt = (await countRecentImageAttempts(pageId, style, options)) + 1;
    if (DRYRUN) {
      process.stdout.write(`[dry-run] learning-log 画像試行 ${style} ×${attempt} ${result}\n`);
      return;
    }
    const outcome = await appendLearningLog(
      { kind: "画像試行", pageId, title, style, result, attempt },
      {
        dataSourceId,
        notionOptions: options,
        createPageFn: createPage,
        nowIso: new Date().toISOString(),
      }
    );
    if (outcome.status === "failed") {
      process.stderr.write(`learning-log 画像試行の記録に失敗: ${String(outcome.error)}\n`);
      await notifyLearningLogFailThrottled("画像試行");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`learning-log 画像試行の記録をスキップしました: ${message}\n`);
  }
}

/** reaper: 処理中・依頼中のまま放置された行(PC停止等)を失敗へ回収し通知する(C2 止血)。 */
async function reap(options: NotionApiOptions): Promise<void> {
  const rows = [
    ...(await rowsByStatus("処理中", options)),
    ...(await rowsByStatus("依頼中", options)),
  ];
  const staleIds = new Set(selectStaleBodyRegenIds(rows, Date.now(), BODY_REGEN_TIMEOUT_MS));
  for (const row of rows) {
    if (!staleIds.has(row.id)) continue;
    await write(row.id, buildBodyRegenFailProps(), options);
    await notify(buildBodyRegenFailMessage(row.title, REAP_REASON));
    process.stderr.write(`reaped(失敗化): ${row.id}\n`);
  }
}

/** 依頼中を1件ロック(処理中)し、claude が処理する JSON を標準出力する。無ければ空。 */
async function next(options: NotionApiOptions): Promise<void> {
  const rows = await rowsByStatus("依頼中", options);
  const row = rows[0];
  if (!row) {
    process.stdout.write("{}\n");
    return;
  }
  if (!row.contentId) {
    // 下書き未作成。差し替え先が無いので失敗にして通知する(沈黙させない)。
    await write(row.id, buildBodyRegenFailProps(), options);
    await notify(buildBodyRegenFailMessage(row.title, "下書きが未作成のため再生成できません。"));
    process.stdout.write("{}\n");
    return;
  }
  const target = parseBodyRegenTarget(row.targetSrc);
  if (!target) {
    // 対象指定が不正(承認画面の検証を通っていれば起きないが念のため)。
    await write(row.id, buildBodyRegenFailProps(), options);
    await notify(buildBodyRegenFailMessage(row.title, "対象画像または挿入位置の指定が不正のため再生成できません。"));
    process.stdout.write("{}\n");
    return;
  }
  await write(row.id, buildBodyRegenProcessingProps(), options);
  const targetFields =
    target.kind === "src"
      ? { targetKind: target.kind, targetSrc: target.src }
      : { targetKind: target.kind, placeholderId: target.placeholderId };
  process.stdout.write(
    `${JSON.stringify({
      pageId: row.id,
      title: row.title,
      instruction: row.instruction,
      contentId: row.contentId,
      ...targetFields,
      style: row.requestedStyle,
      textSpec: row.textSpec,
    })}\n`
  );
}

/**
 * 生成済み画像 URL で本文の当該画像(targetSrc)を差し替え、または placeholder を実画像に置換して通知する。
 * note があれば完了通知に「⚠️ <note>」の1行を載せ、正常完了でも要注意事項を沈黙させない
 * (例: 文字焼き込み3回失敗で文字なし納品・spec §5.3)。
 */
async function done(
  pageId: string,
  target: string,
  newUrl: string,
  alt: string,
  note: string,
  options: NotionApiOptions
): Promise<void> {
  assertPageId(pageId);
  if (!isMicrocmsAssetUrl(newUrl)) {
    throw new Error(`newUrl は microCMS アセットURLにしてください: ${newUrl}`);
  }
  const isPlaceholderTarget = isPlaceholderId(target);
  if (!isPlaceholderTarget && !isMicrocmsAssetUrl(target)) {
    throw new Error(`対象は microCMS アセットURLまたは placeholderId にしてください: ${target}`);
  }
  const row = bodyRegenRowFromPage(await getPage(pageId, options));
  if (!row.contentId) throw new Error("下書きID(contentId)がありません。");
  const { html, replaced } = isPlaceholderTarget
    ? replaceBodyImagePlaceholder(row.bodyHtml, target, bodyImageFigureHtml(newUrl, alt))
    : replaceBodyImageBySrc(row.bodyHtml, target, newUrl);
  if (!replaced) {
    // 依頼後に本文が変更され対象画像が消えた等。沈黙させず失敗にする。
    throw new Error("対象の本文画像または placeholder が見つかりませんでした(本文が変更された可能性があります)。");
  }
  if (DRYRUN) {
    process.stdout.write(`[dry-run] patchDraft ${row.contentId} bodyHtml(${html.length}文字)\n`);
  } else {
    await patchDraft(ENDPOINT, row.contentId, { bodyHtml: html }, contentOptions());
  }
  await write(pageId, { ...buildBodyMirrorProps(html), ...buildBodyRegenDoneProps() }, options);
  await notifyFlex(
    buildBodyRegenDoneMessage(row.title, approveUrl(), note),
    buildBodyRegenDoneFlex(row.title, approveUrl(), note)
  );
  await recordImageAttempt(pageId, row.title, row.requestedStyle, "成功", options);
}

async function fail(pageId: string, reason: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const row = bodyRegenRowFromPage(await getPage(pageId, options));
  const title = row.title;
  await write(pageId, buildBodyRegenFailProps(), options);
  await notify(buildBodyRegenFailMessage(title, reason));
  await recordImageAttempt(pageId, title, row.requestedStyle, "失敗", options);
}

/**
 * `--note <値>` / `--alt <値>` を取り出し、残りの位置引数と分けて返す。
 * `--note=<値>` / `--alt=<値>` 形式も許容する。note は完了通知、alt は挿入画像の代替テキストに使う。
 */
function extractDoneOptions(args: readonly string[]): { positionals: string[]; note: string; alt: string } {
  const positionals: string[] = [];
  let note = "";
  let alt = "";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--note") {
      note = args[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg.startsWith("--note=")) {
      note = arg.slice("--note=".length);
      continue;
    }
    if (arg === "--alt") {
      alt = args[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg.startsWith("--alt=")) {
      alt = arg.slice("--alt=".length);
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, note, alt };
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { positionals, note, alt } = extractDoneOptions(rest);
  const [a, b, c] = positionals;
  const options = notionOptions();
  switch (command) {
    case "reap":
      return reap(options);
    case "next":
      return next(options);
    case "done":
      if (!a || !b || !c) {
        throw new Error("使い方: done <pageId> <targetSrc|placeholderId> <newUrl> [--alt <説明>] [--note <注記>]");
      }
      // 異常に長い通知本文を防ぐ(security M-3)。
      return done(a, b, c, alt.slice(0, 200), note.slice(0, 200), options);
    case "fail":
      if (!a || !b) throw new Error("使い方: fail <pageId> <reason>");
      // 異常に長い通知本文を防ぐ(security M-3)。
      return fail(a, b.slice(0, 200), options);
    default:
      throw new Error("使い方: body-image-regen-cli <reap|next|done|fail> ...");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`body-image-regen-cli に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
