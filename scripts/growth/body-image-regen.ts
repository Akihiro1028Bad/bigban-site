/**
 * 本文画像 AI 再生成ループ(Epic #140 / #156)の純ロジック。
 *
 * アイキャッチ再生成(#144)と同方式の **pull 型**: 承認画面が Notion に「どの本文画像を
 * どう作り直すか」を書き、自宅 PC の画像ループが拾って生成 → microCMS Media へ upload →
 * 本文HTMLの当該 `<img src>` だけを差し替える(`replaceBodyImageBySrc`)→ 下書きを patchDraft する。
 *
 * アイキャッチ再生成との違いは **対象画像の指定**(`targetSrc`)。本文画像は1記事に複数あり得るため、
 * その時点の画像URL(microCMS アセット)で「どの画像か」を持つ(インデックスは本文編集で並びが
 * 変わると壊れるため使わない)。決定的な Notion 書き込み・patchDraft・通知・ロック・回収は
 * CLI(`body-image-regen-cli.ts`)が行い、ここは I/O を持たない純ロジック。
 */

import { BODY_MIRROR_PROP, chunkRichText, type NotionPage } from "./notion";

/** Notion「記事ネタ案」に追加する本文画像再生成ループ用プロパティ名(手動追加)。 */
export const BODY_REGEN_PROPS = {
  /** ユーザーの再生成指示(自由文。空なら PC 側が記事文脈から既定の行為を決める)。 */
  instruction: "本文画像再生成指示",
  /** 再生成ステータス(select)。 */
  status: "本文画像再生成ステータス",
  /** stale-lock 回収・タイムアウト判定用。 */
  requestedAt: "本文画像再生成依頼時刻",
  /** 差し替え対象の本文画像URL(microCMS アセット。その時点の src で「どの画像か」を持つ)。 */
  targetSrc: "本文画像再生成対象",
} as const;

/** 記事ネタ案のタイトル / 下書き ID プロパティ名。 */
const IDEA_TITLE_PROP = "タイトル案";
const DRAFT_ID_PROP = "下書きID";

export type BodyRegenStatus = "なし" | "依頼中" | "処理中" | "失敗";

export const BODY_REGEN_STATUSES: readonly BodyRegenStatus[] = [
  "なし",
  "依頼中",
  "処理中",
  "失敗",
];

/** この状態の行は再依頼を拒否する(処理途中)。 */
export const BODY_REGEN_BUSY_STATUSES: readonly BodyRegenStatus[] = ["依頼中", "処理中"];

/**
 * 再生成リクエストを Notion に書き込むプロパティ群(1 PATCH 用)。
 * 指示が空でも受け付ける(PC 側が記事文脈から既定の行為を決める)。
 * targetSrc(どの画像か)は必須で、依頼ごとに必ず上書きする。
 */
export function buildBodyRegenRequestProps(
  instruction: string,
  targetSrc: string,
  nowIso: string
): Record<string, unknown> {
  const requested: BodyRegenStatus = "依頼中";
  return {
    [BODY_REGEN_PROPS.instruction]: { rich_text: instruction ? chunkRichText(instruction) : [] },
    [BODY_REGEN_PROPS.targetSrc]: { rich_text: chunkRichText(targetSrc) },
    [BODY_REGEN_PROPS.status]: { select: { name: requested } },
    [BODY_REGEN_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}

/** ロック取得(依頼中 → 処理中)。 */
export function buildBodyRegenProcessingProps(): Record<string, unknown> {
  const processing: BodyRegenStatus = "処理中";
  return { [BODY_REGEN_PROPS.status]: { select: { name: processing } } };
}

/** 完了: 指示・対象をクリアし、ステータスをなしに戻す(本文は patchDraft 済み)。 */
export function buildBodyRegenDoneProps(): Record<string, unknown> {
  const cleared: BodyRegenStatus = "なし";
  return {
    [BODY_REGEN_PROPS.status]: { select: { name: cleared } },
    [BODY_REGEN_PROPS.instruction]: { rich_text: [] },
    [BODY_REGEN_PROPS.targetSrc]: { rich_text: [] },
  };
}

/** 失敗: 失敗にする(指示・対象は残し、承認画面から再依頼できる)。理由は LINE 通知で伝える。 */
export function buildBodyRegenFailProps(): Record<string, unknown> {
  const failed: BodyRegenStatus = "失敗";
  return { [BODY_REGEN_PROPS.status]: { select: { name: failed } } };
}

// ── Notion ページ読み取り(poller 用) ──────────────────────────────
function readSelectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function readRichTextPlain(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
}

function readTitlePlain(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { title?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.title ?? []).map((t) => t.plain_text ?? "").join("");
}

function readDateStartMs(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
}

export interface BodyRegenRow {
  id: string;
  title: string;
  /** 再生成指示(空なら既定の行為で生成)。 */
  instruction: string;
  status: BodyRegenStatus;
  requestedAtMs: number | null;
  /** 差し替え先の microCMS 下書き contentId。 */
  contentId: string;
  /** 差し替え対象の本文画像URL(その時点の src)。 */
  targetSrc: string;
  /** 下書き本文HTMLのミラー(#95)。done で当該 img を差し替える対象。 */
  bodyHtml: string;
}

/** Notion ページから poller 用の行情報を取り出す。 */
export function bodyRegenRowFromPage(page: NotionPage): BodyRegenRow {
  const statusName = readSelectName(page, BODY_REGEN_PROPS.status);
  const status: BodyRegenStatus = (BODY_REGEN_STATUSES as readonly string[]).includes(statusName)
    ? (statusName as BodyRegenStatus)
    : "なし";
  return {
    id: page.id,
    title: readTitlePlain(page, IDEA_TITLE_PROP),
    instruction: readRichTextPlain(page, BODY_REGEN_PROPS.instruction),
    status,
    requestedAtMs: readDateStartMs(page, BODY_REGEN_PROPS.requestedAt),
    contentId: readRichTextPlain(page, DRAFT_ID_PROP),
    targetSrc: readRichTextPlain(page, BODY_REGEN_PROPS.targetSrc),
    bodyHtml: readRichTextPlain(page, BODY_MIRROR_PROP),
  };
}

/** 承認画面の表示用ビュー: 再生成ステータス＋対象画像src(依頼中/処理中のとき)。 */
export interface BodyRegenView {
  status: BodyRegenStatus;
  /** 再生成対象の本文画像URL(その時点の src)。なし時は空文字。 */
  targetSrc: string;
}

/**
 * Notion ページから本文画像再生成の表示用ビューを取り出す(#166・read-only)。
 * 承認画面が「どの画像が依頼中/処理中か」をバッジ表示するために status＋targetSrc だけ返す。
 */
export function bodyRegenViewOf(page: NotionPage): BodyRegenView {
  const row = bodyRegenRowFromPage(page);
  return { status: row.status, targetSrc: row.targetSrc };
}

/** stale-lock とみなす時間(処理中のまま放置 → 失敗に回収)。 */
export const BODY_REGEN_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * 処理中のまま timeoutMs を超えた行(PC が落ちた等)の id を返す(reaper 対象)。
 * 依頼時刻が無い行は対象にしない(誤回収を避ける)。
 */
export function selectStaleBodyRegenIds(
  rows: readonly BodyRegenRow[],
  nowMs: number,
  timeoutMs: number
): string[] {
  return rows
    .filter(
      (r) =>
        r.status === "処理中" &&
        r.requestedAtMs !== null &&
        nowMs - r.requestedAtMs > timeoutMs
    )
    .map((r) => r.id);
}

/** 再生成完了の LINE 本文(承認画面URLへ誘導)。 */
export function buildBodyRegenDoneMessage(title: string, approveUrl: string): string {
  return [
    "本文画像を再生成しました。",
    `タイトル: ${title}`,
    "承認画面のプレビューで確認してください。",
    approveUrl,
  ].join("\n");
}

/** 再生成失敗の LINE 本文(沈黙させない・#24整合)。 */
export function buildBodyRegenFailMessage(title: string, reason: string): string {
  return [
    "本文画像の再生成に失敗しました(外部障害や本文変更の可能性があります)。",
    `タイトル: ${title}`,
    `理由: ${reason}`,
    "承認画面から、もう一度再生成を依頼できます。",
  ].join("\n");
}

// ── 本文HTMLの当該 <img src> 差し替え(done で使う) ──────────────────
// microCMS アセットの許可ホスト(src/lib/growth/media.ts の isMicrocmsAssetUrl と同一基準)。
// CLI(scripts)は "@/" エイリアスを使わないため、同じ判定をここに持つ(任意 URL を対象に
// できないようにする SSRF/外部画像の境界検証)。
const MICROCMS_ASSET_HOST = "images.microcms-assets.io";
const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_ATTR_RE = /\bsrc\s*=\s*"([^"]*)"/i;
// 差し替え用: 先頭の `src="` と閉じ `"` を捕捉して値だけ入れ替える。
const SRC_REPLACE_RE = /(\bsrc\s*=\s*")[^"]*(")/i;

/** 値が microCMS アセット URL(https・images.microcms-assets.io)か判定する。 */
export function isMicrocmsAssetUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname === MICROCMS_ASSET_HOST;
}

function srcOf(tag: string): string {
  const m = tag.match(SRC_ATTR_RE);
  return m ? m[1] : "";
}

/**
 * 本文HTML(microCMS アセット画像)のうち `src` が oldSrc に一致する**最初の** `<img>` の
 * `src` を newUrl に差し替え、`{ html, replaced }` を返す(本文画像 AI 再生成 #156)。
 *
 * インデックスではなく **src で対象を特定**するのは、再生成依頼から PC 処理までの間に本文編集で
 * 画像の並びが変わっても正しい画像を狙えるようにするため。対象が見つからなければ replaced=false を
 * 返し(本文は無変更)、呼び出し側(CLI)が「本文が変更された」として失敗扱いにできる(沈黙させない)。
 *
 * oldSrc が microCMS アセットでない場合は一致させない(任意 URL を対象にできないようにする防御)。
 * 同一 src が複数あっても先頭の1枚だけ差し替える(決定的)。置換は #145 と同じ**関数形式**で行い、
 * newUrl 内の `$1`/`$2` 等が特殊シーケンスとして展開され属性が壊れるのを防ぐ(security H-1)。
 */
export function replaceBodyImageBySrc(
  html: string,
  oldSrc: string,
  newUrl: string
): { html: string; replaced: boolean } {
  if (!isMicrocmsAssetUrl(oldSrc)) return { html, replaced: false };
  let replaced = false;
  const out = html.replace(IMG_TAG_RE, (tag) => {
    if (replaced) return tag;
    const src = srcOf(tag);
    if (src !== oldSrc || !isMicrocmsAssetUrl(src)) return tag;
    replaced = true;
    return tag.replace(SRC_REPLACE_RE, (_m, open: string, close: string) => `${open}${newUrl}${close}`);
  });
  return { html: out, replaced };
}
