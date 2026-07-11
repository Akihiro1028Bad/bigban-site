import DOMPurify from "isomorphic-dompurify";

import { EMBED_PROVIDER_IDS } from "./embeds/registry";

/* istanbul ignore next -- @preserve jsdom 環境では DOMPurify は常にサポートされるため到達不可 */
if (!DOMPurify.isSupported) {
  throw new Error(
    "[news/sanitize] DOMPurify JSDOM binding failed; sanitization would silently bypass",
  );
}

const ALLOWED_IMG_HOST = "images.microcms-assets.io";

const COMMON_FORBID_TAGS = [
  "script",
  "iframe",
  "style",
  "base",
  "link",
  "object",
  "embed",
  "form",
];
const COMMON_FORBID_ATTR = [
  "style",
  "formaction",
  "onclick",
  "onload",
  "onerror",
];

const COMMON_ALLOWED_ATTR = [
  "href",
  "title",
  "class",
  "src",
  "alt",
  "width",
  "height",
  "cite",
  "target",
  "rel",
  "loading",
  "decoding",
  "fetchpriority",
  // table 系
  "scope",
  "colspan",
  "rowspan",
  // a11y 系 (table scroll wrapper 等)
  "tabindex",
  "role",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  // <time datetime="..."> 用
  "datetime",
  // SNS 埋め込みトークン (<a class="embed" data-embed-provider data-embed-id>)
  // 値検証は uponSanitizeAttribute フック内で行う
  "data-embed-provider",
  "data-embed-id",
  // 本文画像生成プレースホルダ (<figure data-pending="img-...">)
  // 値検証は uponSanitizeAttribute フック内で行う
  "data-pending",
];

// 注: ALLOWED_URI_REGEXP オプションは DOMPurify 3.x + jsdom env で
// 関係ない属性 (scope/colspan 等) を巻き込んで削除するバグ的挙動があるため使わず、
// 下記 ALLOWED_HREF_PROTOCOLS でフック内検証する。
const ALLOWED_HREF_PROTOCOLS = /^(?:https:|mailto:|tel:|#)/;

// STRICT/RICH 共通の許可クラス。HTMLモード/リッチエディタモードどちらでも
// 同じ class allowlist を適用する (RICH の class 任意通過は HIGH リスクのため)。
const ALLOWED_CLASSES = new Set([
  "lead",
  "caption",
  "badge",
  "highlight",
  "note",
  "caution",
  "news-table-scroll",
  // CTA ボタン (一次/二次)
  "cta",
  "cta--ghost",
  // スケジュール timeline
  "schedule",
  "schedule-item",
  // SNS 埋め込みトークン (<a class="embed" data-embed-provider data-embed-id>)
  "embed",
]);

// 共通の許可タグ (block / inline / table / 注釈)
const COMMON_ALLOWED_TAGS = [
  "h2",
  "h3",
  "h4",
  "p",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "blockquote",
  "strong",
  "em",
  "code",
  "pre",
  "figure",
  "figcaption",
  "br",
  "hr",
  // table
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  // inline / block 拡張
  "span",
  "aside",
  "mark",
  "time",
];

export const STRICT_HTML_CONFIG = {
  ALLOWED_TAGS: COMMON_ALLOWED_TAGS,
  ALLOWED_ATTR: COMMON_ALLOWED_ATTR,
  FORBID_TAGS: COMMON_FORBID_TAGS,
  FORBID_ATTR: COMMON_FORBID_ATTR,
};

// RICH_EDITOR_CONFIG も明示的に ALLOWED_TAGS を指定し、デフォルトの
// ~80 タグ (svg/math/details/video/audio 等) を除外する。
// Sec レビュー HIGH 指摘対応: 暗黙の許可タグによるクリックジャック等を防止。
export const RICH_EDITOR_CONFIG = {
  ALLOWED_TAGS: COMMON_ALLOWED_TAGS,
  ALLOWED_ATTR: COMMON_ALLOWED_ATTR,
  FORBID_TAGS: COMMON_FORBID_TAGS,
  FORBID_ATTR: COMMON_FORBID_ATTR,
};

const VALID_SCOPE_VALUES = new Set(["row", "col", "rowgroup", "colgroup"]);
const SPAN_REGEX = /^[1-9]\d?$/;
// HTML5 time datetime: ISO 8601 ライク (年/年月/年月日/日時/タイムゾーン任意)
const ISO_DATETIME_REGEX =
  /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;
// SNS 埋め込みトークンの ID は基本英数字 + ハイフン + アンダースコア (DoS / 注入対策)
// プロバイダ固有の厳密検証 (例: YouTube は 11 文字固定) は registry 側で行う
const EMBED_ID_GENERIC_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const PENDING_ID_REGEX = /^img-[A-Za-z0-9-]{6,64}$/;
const EMBED_PROVIDER_SET = new Set(EMBED_PROVIDER_IDS);

// DOMPurify.addHook はモジュール評価のたびに呼ぶと同じ DOMPurify インスタンスに
// hook が累積する (vi.resetModules や HMR 環境で発生しうる)。
// DOMPurify オブジェクト上のシンボルキーで「登録済みフラグ」を保持し、冪等にする。
const HOOKS_REGISTERED = Symbol.for("news-sanitize/hooks-registered");
type DOMPurifyWithFlag = typeof DOMPurify & {
  [HOOKS_REGISTERED]?: boolean;
};

function registerHooksOnce(): void {
  const dp = DOMPurify as DOMPurifyWithFlag;
  /* istanbul ignore next -- @preserve 同一プロセス内で sanitize.ts が複数回 import された時の冪等性ガード (vi.resetModules / HMR 時の累積防止) */
  if (dp[HOOKS_REGISTERED]) return;
  dp[HOOKS_REGISTERED] = true;

  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    const tag = (node as Element).tagName;

    // <img src> はホスト制限
    if (data.attrName === "src" && tag === "IMG") {
      try {
        const u = new URL(data.attrValue);
        if (u.hostname !== ALLOWED_IMG_HOST) {
          data.keepAttr = false;
        }
      } catch {
        data.keepAttr = false;
      }
      return;
    }

    // <a href> は protocol allowlist 検証
    if (data.attrName === "href" && tag === "A") {
      if (!ALLOWED_HREF_PROTOCOLS.test(data.attrValue)) {
        data.keepAttr = false;
      }
      return;
    }

    // <th scope=...> は enum 検証
    if (data.attrName === "scope") {
      if (!VALID_SCOPE_VALUES.has(data.attrValue)) {
        data.keepAttr = false;
      }
      return;
    }

    // <td/th colspan|rowspan> は 1-99 のみ (DoS 対策)
    if (data.attrName === "colspan" || data.attrName === "rowspan") {
      if (!SPAN_REGEX.test(data.attrValue)) {
        data.keepAttr = false;
      }
      return;
    }

    // <time datetime=...> のみ受理し、ISO 8601 形式のみに制限
    if (data.attrName === "datetime") {
      if (tag !== "TIME" || !ISO_DATETIME_REGEX.test(data.attrValue)) {
        data.keepAttr = false;
      }
      return;
    }

    // SNS 埋め込みトークン (<a data-embed-provider data-embed-id>)
    // - <a> 以外では受理しない (スコープ制限)
    // - data-embed-provider は registry に存在するプロバイダのみ
    // - data-embed-id は generic regex で形式検証 (provider 固有検証は renderer 側)
    if (data.attrName === "data-embed-provider") {
      if (tag !== "A" || !EMBED_PROVIDER_SET.has(data.attrValue)) {
        data.keepAttr = false;
      }
      return;
    }
    if (data.attrName === "data-embed-id") {
      if (tag !== "A" || !EMBED_ID_GENERIC_REGEX.test(data.attrValue)) {
        data.keepAttr = false;
      }
      return;
    }

    if (data.attrName === "data-pending") {
      if (tag !== "FIGURE" || !PENDING_ID_REGEX.test(data.attrValue)) {
        data.keepAttr = false;
      }
      return;
    }
  });

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (el.tagName === "A" && el.hasAttribute("href")) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
    if (el.tagName === "IMG") {
      if (!el.hasAttribute("width") || !el.hasAttribute("height")) {
        el.setAttribute("width", "1200");
        el.setAttribute("height", "675");
        console.warn(
          "[news/sanitize] <img> missing width/height; default 1200x675 applied",
        );
      }
      /* istanbul ignore next -- @preserve 入力 HTML に loading 属性が事前に付くケースは運用上稀 */
      if (!el.hasAttribute("loading")) el.setAttribute("loading", "lazy");
      /* istanbul ignore next -- @preserve 入力 HTML に decoding 属性が事前に付くケースは運用上稀 */
      if (!el.hasAttribute("decoding")) el.setAttribute("decoding", "async");
    }
  });
}

registerHooksOnce();

// `class="..."` (double quotes) と `class='...'` (single quotes) の両方を捕捉。
// DOMPurify は通常 double quote に正規化するが、念のため両方サポートする
// (将来 DOMPurify オプションが変わったり、将来別のサニタイザに差し替えても安全)。
function filterClasses(html: string, allowed: Set<string>): string {
  return html.replace(
    /\sclass=(?:"([^"]*)"|'([^']*)')/g,
    (_match, dq?: string, sq?: string) => {
      /* istanbul ignore next -- @preserve DOMPurify は出力を double-quote に正規化するため single-quote 分岐は防御的 (将来 DOMPurify オプション変更や別サニタイザ差し替え対策) */
      const classes = dq ?? sq ?? "";
      const filtered = classes
        .split(/\s+/)
        .filter((c) => c.length > 0 && allowed.has(c));
      if (filtered.length === 0) return "";
      // 出力は常に double quote に正規化
      return ` class="${filtered.join(" ")}"`;
    },
  );
}

export interface SanitizeOptions {
  isFirstImageLcp?: boolean;
}

export function sanitizeNewsHtml(
  html: string,
  config: typeof STRICT_HTML_CONFIG | typeof RICH_EDITOR_CONFIG,
  options: SanitizeOptions = {},
): string {
  let result = DOMPurify.sanitize(html, config) as unknown as string;

  // class allowlist は STRICT / RICH 両モード共通で適用
  // (RICH モードで任意の class が通ると Tailwind ユーティリティでの
  //  clickjacking 等が可能なため)
  result = filterClasses(result, ALLOWED_CLASSES);

  if (options.isFirstImageLcp) {
    result = result.replace(/<img([^>]*?)>/, (match, attrs: string) => {
      /* istanbul ignore next -- @preserve 入力 HTML が事前に loading=eager を持つケースは運用上稀 */
      if (/loading="eager"/.test(attrs)) return match;
      const stripped = attrs
        .replace(/\sloading="[^"]*"/, "")
        .replace(/\sdecoding="[^"]*"/, "");
      return `<img${stripped} fetchpriority="high" loading="eager" decoding="async">`;
    });
  }
  return result;
}
