/**
 * 本文画像 AI 再生成ループ(Epic #140 / #156)の決定的オペレーション CLI(headless poller 用)。
 *
 *   npm run growth:body-image-regen -- reap                              # 処理中のstale(>15分)を失敗に回収＋通知
 *   npm run growth:body-image-regen -- next                              # 依頼中を1件ロック(処理中)し JSON を標準出力
 *   npm run growth:body-image-regen -- done <pageId> <targetSrc> <url>   # 生成画像URLで本文の当該画像を差し替え＋完了＋通知
 *   npm run growth:body-image-regen -- fail <pageId> <reason>            # 失敗にして理由＋通知
 *
 * claude(regen-body-image.md)は「指示→スタイル/説明を決めて gen-body-image / upload-media を回す」
 * 創作部分だけを担い、Notion 書き込み・本文HTML差し替え・patchDraft・通知・ロック・回収はこの CLI が
 * 決定的に行う。純ロジックは body-image-regen.ts でテスト済み。薄い配線のためカバレッジ対象外。
 * GROWTH_DRYRUN=1 では書き込み/送信せず内容を表示する。
 */

import "dotenv/config";

import {
  buildBodyRegenDoneMessage,
  buildBodyRegenDoneProps,
  buildBodyRegenFailMessage,
  buildBodyRegenFailProps,
  buildBodyRegenProcessingProps,
  bodyRegenRowFromPage,
  BODY_REGEN_PROPS,
  BODY_REGEN_TIMEOUT_MS,
  isMicrocmsAssetUrl,
  replaceBodyImageBySrc,
  selectStaleBodyRegenIds,
  type BodyRegenRow,
} from "./body-image-regen";
import { patchDraft } from "./content";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import {
  buildBodyMirrorProps,
  getPage,
  queryDataSource,
  updatePageProps,
  type NotionApiOptions,
} from "./notion";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const ENDPOINT = "news";
const REAP_REASON = "処理が15分以上完了しませんでした(PC再起動等の可能性)。もう一度再生成を依頼できます。";
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const PAGE_ID_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
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

async function write(pageId: string, props: Record<string, unknown>, options: NotionApiOptions): Promise<void> {
  if (DRYRUN) {
    process.stdout.write(`[dry-run] PATCH ${pageId}: ${JSON.stringify(props)}\n`);
    return;
  }
  await updatePageProps(pageId, props, options);
}

/** reaper: 処理中のまま放置された行を失敗へ回収し通知する。 */
async function reap(options: NotionApiOptions): Promise<void> {
  const rows = await rowsByStatus("処理中", options);
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
  if (!isMicrocmsAssetUrl(row.targetSrc)) {
    // 対象画像が不正(承認画面の検証を通っていれば起きないが念のため)。
    await write(row.id, buildBodyRegenFailProps(), options);
    await notify(buildBodyRegenFailMessage(row.title, "対象画像の指定が不正のため再生成できません。"));
    process.stdout.write("{}\n");
    return;
  }
  await write(row.id, buildBodyRegenProcessingProps(), options);
  process.stdout.write(
    `${JSON.stringify({
      pageId: row.id,
      title: row.title,
      instruction: row.instruction,
      contentId: row.contentId,
      targetSrc: row.targetSrc,
    })}\n`
  );
}

/** 生成済み画像 URL で本文の当該画像(targetSrc)を差し替え、完了にして通知する。 */
async function done(
  pageId: string,
  targetSrc: string,
  newUrl: string,
  options: NotionApiOptions
): Promise<void> {
  assertPageId(pageId);
  if (!isMicrocmsAssetUrl(targetSrc)) {
    throw new Error(`targetSrc は microCMS アセットURLにしてください: ${targetSrc}`);
  }
  if (!isMicrocmsAssetUrl(newUrl)) {
    throw new Error(`newUrl は microCMS アセットURLにしてください: ${newUrl}`);
  }
  const row = bodyRegenRowFromPage(await getPage(pageId, options));
  if (!row.contentId) throw new Error("下書きID(contentId)がありません。");
  const { html, replaced } = replaceBodyImageBySrc(row.bodyHtml, targetSrc, newUrl);
  if (!replaced) {
    // 依頼後に本文が変更され対象画像が消えた等。沈黙させず失敗にする。
    throw new Error("対象の本文画像が見つかりませんでした(本文が変更された可能性があります)。");
  }
  if (DRYRUN) {
    process.stdout.write(`[dry-run] patchDraft ${row.contentId} bodyHtml(${html.length}文字)\n`);
  } else {
    await patchDraft(ENDPOINT, row.contentId, { bodyHtml: html }, contentOptions());
  }
  await write(pageId, { ...buildBodyMirrorProps(html), ...buildBodyRegenDoneProps() }, options);
  await notify(buildBodyRegenDoneMessage(row.title, approveUrl()));
}

async function fail(pageId: string, reason: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const title = bodyRegenRowFromPage(await getPage(pageId, options)).title;
  await write(pageId, buildBodyRegenFailProps(), options);
  await notify(buildBodyRegenFailMessage(title, reason));
}

async function main(): Promise<void> {
  const [command, a, b, c] = process.argv.slice(2);
  const options = notionOptions();
  switch (command) {
    case "reap":
      return reap(options);
    case "next":
      return next(options);
    case "done":
      if (!a || !b || !c) throw new Error("使い方: done <pageId> <targetSrc> <newUrl>");
      return done(a, b, c, options);
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
