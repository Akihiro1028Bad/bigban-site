/**
 * 下書き作成完了を LINE 通知するためのメッセージ・プレビューURL組み立て(純関数)。
 *
 * プレビューURLは既存のプレビュー入口(`/api/draft/enable`, Pattern A)を使う。
 * 将来、管理画面で下書きを閲覧できるようになったら、ここの URL 組み立てだけを
 * 差し替えれば通知側は変更不要(URL生成を1箇所に集約している)。
 *
 * リッチ通知(#35)は buildDraftFlex で Flex カルーセル(記事ごとにカード)を組み立てる。
 * テキスト版は Flex 非対応環境の altText フォールバックとして引き続き使う。
 */

import type {
  FlexBox,
  FlexBubble,
  FlexCarousel,
  FlexComponent,
  FlexImage,
} from "./digest-flex";

export interface DraftPreviewParams {
  /** 例: https://www.thepicklebang.com (末尾スラッシュは正規化する) */
  siteUrl: string;
  secret: string;
  contentId: string;
  draftKey: string;
}

/** プレビュー入口(Pattern A: contentId + draftKey)の URL を組み立てる。 */
export function buildPreviewUrl(params: DraftPreviewParams): string {
  const base = params.siteUrl.replace(/\/+$/, "");
  const query = new URLSearchParams({
    secret: params.secret,
    draftKey: params.draftKey,
    contentId: params.contentId,
  });
  return `${base}/api/draft/enable?${query.toString()}`;
}

export interface PreviewUrlInput {
  siteUrl: string | null | undefined;
  secret: string | null | undefined;
  contentId: string;
  draftKey: string | null | undefined;
}

/**
 * プレビューURLを組み立てる。siteUrl / secret / draftKey のいずれかが欠けていれば null。
 * (env や draftKey が無くても通知自体は続行させるため、ここで例外を投げない。)
 */
export function previewUrlOrNull(input: PreviewUrlInput): string | null {
  if (!input.siteUrl || !input.secret || !input.draftKey) {
    return null;
  }
  return buildPreviewUrl({
    siteUrl: input.siteUrl,
    secret: input.secret,
    contentId: input.contentId,
    draftKey: input.draftKey,
  });
}

export interface DraftNotifyItem {
  title: string;
  contentId: string;
  /** プレビューURL。draftKey が取れなかった場合は null。 */
  previewUrl: string | null;
}

/** 1記事分の行(タイトル + プレビュー or 下書きID)を作る。 */
function renderItem(item: DraftNotifyItem, index: number): string {
  const head = `${index + 1}. ${item.title}`;
  const detail = item.previewUrl
    ? `プレビュー: ${item.previewUrl}`
    : `下書きID: ${item.contentId}（プレビューURLは取得できませんでした）`;
  return `${head}\n${detail}`;
}

/** 失敗原因の分類(#58)。一律「外部障害」と断定しないための区別。 */
export type DraftFailureCategory = "timeout" | "external" | "client";

/**
 * 失敗理由(エラーメッセージ文字列)を timeout / client / external に分類する(#58)。
 * - timeout: 自前 AbortController のタイムアウト、またはゲートウェイのタイムアウト
 * - client: microCMS が 4xx を返した(送信内容の問題。再試行しても無駄)
 * - external: 5xx / ネットワーク / 不明(外部障害の可能性)
 *
 * pipeline はエラーを文字列(message)で保持するため、型ではなく文字列で判定する。
 */
export function classifyDraftFailure(error: string): DraftFailureCategory {
  if (/タイムアウト|timed?\s?out/i.test(error)) return "timeout";
  if (/HTTP\s4\d\d/.test(error)) return "client";
  return "external";
}

const FAILURE_HEAD: Record<DraftFailureCategory, string> = {
  timeout:
    "下書きの投入がタイムアウトしました(microCMS の書き込みに時間がかかっています)。",
  external: "下書きの投入に失敗しました(外部障害の可能性があります)。",
  client: "下書きの投入に失敗しました(送信内容に問題がある可能性があります)。",
};

export interface DraftFailureInput {
  failedStage: string;
  error: string;
  specPath: string;
  /** 明示指定する場合の分類。未指定なら error から推定する。 */
  category?: DraftFailureCategory;
}

/**
 * 下書き投入が失敗したときの LINE 通知本文(沈黙させない=#24)。
 * 失敗原因(timeout/external/client)を区別して文言を出し分け(#58)、
 * 冪等(#21)に再開できる手順を伝える。
 */
export function buildDraftFailureMessage(input: DraftFailureInput): string {
  const category = input.category ?? classifyDraftFailure(input.error);
  return [
    FAILURE_HEAD[category],
    `失敗した工程: ${input.failedStage}`,
    `理由: ${input.error}`,
    `本文・設定はステージ済み: ${input.specPath}`,
    "復旧後、同じ内容で再実行すれば重複なく再開できます:",
    `  npm run growth:publish-draft -- ${input.specPath}`,
    "  (または下書きモード全体の再実行: npm run growth:drafts)",
  ].join("\n");
}

/** LINE へ送る下書き完了通知の本文を組み立てる。 */
export function buildDraftNotifyMessage(
  items: readonly DraftNotifyItem[]
): string {
  if (items.length === 0) {
    return "下書きは作成されませんでした。";
  }
  const header = `下書きを${items.length}件作成しました。`;
  const body = items.map(renderItem).join("\n\n");
  return `${header}\n\n${body}`;
}

// ── #35: Flex カルーセル(記事ごとにカード) ──────────────────────────────
const MAX_BUBBLES = 12; // LINE carousel は最大12バブル
const HEADING_COLOR = "#111827";
const EXCERPT_COLOR = "#6b7280";
const BADGE_BG = "#306EC3"; // ブランドの Bright Blue
const BADGE_TEXT = "#ffffff";

export interface DraftFlexItem {
  title: string;
  /** 抜粋。空文字なら省略する。 */
  excerpt: string;
  /** カテゴリ名(例: お知らせ)。空文字ならバッジを省略する。 */
  category: string;
  /** アイキャッチ画像 URL(HTTPS)。null なら hero を省略する。 */
  eyecatchUrl: string | null;
  /** プレビューURL。null ならボタンの代わりに下書きIDを案内する。 */
  previewUrl: string | null;
  contentId: string;
}

function heroImage(url: string): FlexImage {
  return { type: "image", url, size: "full", aspectRatio: "16:9", aspectMode: "cover" };
}

/** カテゴリのピル型バッジ(内容幅・左寄せ)。 */
function categoryBadge(category: string): FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 0,
        backgroundColor: BADGE_BG,
        cornerRadius: "md",
        paddingStart: "sm",
        paddingEnd: "sm",
        paddingTop: "xs",
        paddingBottom: "xs",
        contents: [{ type: "text", text: category, size: "xs", color: BADGE_TEXT }],
      },
      // 右側のフィラーでピルを左に寄せる(横幅いっぱいに広げない)。
      { type: "text", text: " ", flex: 1 },
    ],
  };
}

/** フッター: プレビューボタン、無ければ下書きIDのフォールバック(沈黙させない)。 */
function draftFooter(item: DraftFlexItem): FlexBox {
  if (item.previewUrl) {
    return {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          action: { type: "uri", label: "プレビューを開く", uri: item.previewUrl },
        },
      ],
    };
  }
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `下書きID: ${item.contentId}（プレビューURLは取得できませんでした）`,
        size: "xs",
        color: EXCERPT_COLOR,
        wrap: true,
      },
    ],
  };
}

function draftBubble(item: DraftFlexItem): FlexBubble {
  const bodyContents: FlexComponent[] = [];
  if (item.category) bodyContents.push(categoryBadge(item.category));
  bodyContents.push({
    type: "text",
    text: item.title,
    weight: "bold",
    size: "md",
    color: HEADING_COLOR,
    wrap: true,
    maxLines: 2,
  });
  if (item.excerpt) {
    bodyContents.push({
      type: "text",
      text: item.excerpt,
      size: "sm",
      color: EXCERPT_COLOR,
      wrap: true,
      maxLines: 3,
    });
  }

  const bubble: FlexBubble = {
    type: "bubble",
    body: { type: "box", layout: "vertical", spacing: "sm", contents: bodyContents },
    footer: draftFooter(item),
  };
  if (item.eyecatchUrl) bubble.hero = heroImage(item.eyecatchUrl);
  return bubble;
}

/**
 * 下書き完了通知を Flex カルーセルにする(記事ごとに1バブル・最大12)。
 * 画像/プレビューURL/カテゴリ/抜粋が欠けてもフォールバックして必ずカードを作る。
 */
export function buildDraftFlex(items: readonly DraftFlexItem[]): FlexCarousel {
  return {
    type: "carousel",
    contents: items.slice(0, MAX_BUBBLES).map(draftBubble),
  };
}
