"use client";

import { Fragment } from "react";

import type { Locale } from "@/i18n/routing";
import { articleBodyCtaKey } from "@/lib/analytics/events";
import { trackCtaClick } from "@/lib/analytics/trackEvent";
import {
  RICH_EDITOR_CONFIG,
  STRICT_HTML_CONFIG,
  sanitizeNewsHtml,
} from "@/lib/news/sanitize";
import type { NewsItem } from "@/lib/microcms/schema";

import { InstagramEmbed } from "./embeds/InstagramEmbed";
import { YouTubeEmbed } from "./embeds/YouTubeEmbed";

import type { MouseEventHandler } from "react";

interface NewsBodyRendererProps {
  displayMode: NewsItem["displayMode"];
  bodyHtml: string;
  body: string;
  isFirstImageLcp?: boolean;
  locale?: Locale;
  articleSlug?: string;
}

const ARTICLE_BODY_CTA_LOCATION = "article_body_cta";

// グロース承認画面のプレビュー(#proto)が本番と同一の本文スタイルを再利用するため export する。
export const PROSE_CLASS = [
  "prose prose-invert max-w-none",
  "prose-headings:text-text-light prose-headings:font-bold",
  "prose-h2:text-xl lg:prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4",
  "prose-h3:text-base lg:prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3",
  "prose-p:text-text-light prose-p:text-base lg:prose-p:text-lg prose-p:leading-relaxed",
  "prose-a:text-accent prose-a:underline prose-a:decoration-accent/40 prose-a:underline-offset-4",
  "prose-a:hover:decoration-accent",
  "prose-a:focus-visible:outline prose-a:focus-visible:outline-2 prose-a:focus-visible:outline-accent prose-a:focus-visible:outline-offset-2",
  "prose-strong:text-text-light prose-strong:font-semibold",
  "prose-blockquote:border-l-2 prose-blockquote:border-accent/40 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-text-light/85",
  "prose-ul:my-6 prose-ol:my-6 prose-li:my-2 prose-li:marker:text-accent",
  // 画像: 自然サイズ + コンテナ幅まで縮小、中央寄せ、シャープエッジ
  "prose-img:rounded-none prose-img:max-w-full prose-img:h-auto prose-img:block prose-img:mx-auto prose-img:my-8",
  "prose-figure:my-12 prose-figure:text-center",
  "prose-figcaption:text-sm prose-figcaption:text-text-gray prose-figcaption:tracking-wide prose-figcaption:mt-3 prose-figcaption:italic",
  "prose-hr:border-text-gray/20 prose-hr:my-12",
].join(" ");

// All HTML rendered via dangerouslySetInnerHTML below is run through
// sanitizeNewsHtml (DOMPurify) with STRICT_HTML_CONFIG or RICH_EDITOR_CONFIG.
// Untrusted CMS content is XSS-safe after sanitization (see lib/news/sanitize.ts).

/**
 * <table> をスクロール可能なラッパーで包む (a11y + モバイル対応)。
 * - role="region" + aria-label: スクリーンリーダ向けのランドマーク
 * - tabindex="0": キーボード矢印キーでスクロール可能
 */
function wrapTablesForScroll(html: string): string {
  return html
    .replace(
      /<table([^>]*)>/g,
      (_match, attrs: string) =>
        `<figure class="news-table-scroll" role="region" tabindex="0" aria-label="表"><table${attrs}>`,
    )
    .replace(/<\/table>/g, "</table></figure>");
}

/**
 * microCMS 画像 (images.microcms-assets.io) の src に画像 API パラメータを
 * 自動付与し、WebP + 最大幅 1200px に最適化する。
 * 既にクエリパラメータ付きの URL は二重付与しない。
 *
 * 例:
 *   <img src="https://images.microcms-assets.io/foo.jpg" />
 *   → <img src="https://images.microcms-assets.io/foo.jpg?w=1200&fm=webp&q=80" />
 */
function optimizeMicrocmsImages(html: string): string {
  return html.replace(
    /(<img[^>]*\ssrc=")(https:\/\/images\.microcms-assets\.io\/[^"?]+)(")/g,
    (_match, before: string, src: string, after: string) =>
      `${before}${src}?w=1200&fm=webp&q=80${after}`,
  );
}

/**
 * SNS 埋め込みトークンの抽出。
 *
 * 入力: サニタイズ済み HTML
 * 出力: { kind: "html"|"embed", ... } のセグメント配列
 *
 * - <a> 内に data-embed-provider と data-embed-id の両方がある時のみマッチ
 *   (サニタイザーが provider を allowlist 検証済みなのでここで再検証は不要)
 * - 属性順序非依存 (各属性を個別に regex 抽出)
 * - 規約: 埋め込みトークンは top-level に置く (Skill 側で担保)
 *   <p> 内に置かれた場合の HTML 境界の整合性は最善努力 (R1 リスク参照)
 */
type BodySegment =
  | { kind: "html"; html: string }
  | { kind: "embed"; provider: string; id: string };

// 既知の制限: 属性キャプチャ [^>]+ は属性値内のリテラル '>' を扱えない
// (例: title="A > B")。サニタイズ済み HTML + 制御された embed token の文脈
// では実用上問題ないが、将来許可属性が増える時はこの前提を再評価すること。
const ANCHOR_TAG_RE = /<a\s([^>]+)>([\s\S]*?)<\/a>/g;
const PROVIDER_ATTR_RE = /\bdata-embed-provider="([a-z]+)"/;
const ID_ATTR_RE = /\bdata-embed-id="([A-Za-z0-9_-]+)"/;

function segmentBodyHtml(html: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let lastIdx = 0;
  ANCHOR_TAG_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ANCHOR_TAG_RE.exec(html)) !== null) {
    const attrs = match[1];
    const providerMatch = PROVIDER_ATTR_RE.exec(attrs);
    const idMatch = ID_ATTR_RE.exec(attrs);
    if (!providerMatch || !idMatch) continue; // 普通の <a> リンクは触らない

    const start = match.index;
    if (start > lastIdx) {
      segments.push({ kind: "html", html: html.slice(lastIdx, start) });
    }
    segments.push({
      kind: "embed",
      provider: providerMatch[1],
      id: idMatch[1],
    });
    lastIdx = start + match[0].length;
  }

  if (lastIdx === 0) {
    // 埋め込みトークン無し: 早期リターン (従来パスと同じ単一セグメント)
    return [{ kind: "html", html }];
  }
  if (lastIdx < html.length) {
    segments.push({ kind: "html", html: html.slice(lastIdx) });
  }
  return segments;
}

/**
 * provider 名 → React Component の dispatcher (Map ベース)。
 * 未登録プロバイダはサニタイザーで data-embed-provider が落とされるため
 * 通常ここに到達しないが、防御的に null を返す (istanbul-ignored)。
 */
const EMBED_COMPONENTS: Record<
  string,
  React.ComponentType<{ embedId: string }>
> = {
  youtube: YouTubeEmbed,
  instagram: InstagramEmbed,
};

function renderEmbed(provider: string, id: string, key: number) {
  const Component = EMBED_COMPONENTS[provider];
  /* istanbul ignore next -- @preserve サニタイザーが registry に無い provider を弾くため未知 provider は到達不可 */
  if (!Component) return null;
  return <Component key={key} embedId={id} />;
}

function renderBody(
  safeHtml: string,
  onClick?: MouseEventHandler<HTMLDivElement>,
) {
  const processed = optimizeMicrocmsImages(wrapTablesForScroll(safeHtml));
  const segments = segmentBodyHtml(processed);

  // 埋め込み無しの場合は従来通りの単一 div で描画 (CSS prose の挙動を完全維持)
  if (segments.length === 1 && segments[0].kind === "html") {
    return (
      <div
        data-testid="news-body"
        className={`news-body ${PROSE_CLASS}`}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: segments[0].html }}
      />
    );
  }

  // 埋め込みあり: HTML セグメントと React Component を交互にレンダリング
  // contents (display: contents) で wrapper div を視覚的に透明化し、
  // prose の descendant selector に影響を与えない。
  return (
    <div
      data-testid="news-body"
      className={`news-body ${PROSE_CLASS}`}
      onClick={onClick}
    >
      {segments.map((seg, i) => {
        if (seg.kind === "html") {
          /* istanbul ignore next -- @preserve segmentBodyHtml は空 html セグメントを push しない設計のため到達不可 (防御的記述) */
          if (seg.html.length === 0) return null;
          return (
            <div
              key={`html-${i}`}
              className="contents"
              dangerouslySetInnerHTML={{ __html: seg.html }}
            />
          );
        }
        return (
          <Fragment key={`embed-${i}`}>
            {renderEmbed(seg.provider, seg.id, i)}
          </Fragment>
        );
      })}
    </div>
  );
}

function renderEmpty(locale: Locale) {
  const message =
    locale === "en" ? "No content available." : "本文がありません。";
  return (
    <div data-testid="news-body-empty" className={PROSE_CLASS} role="status">
      {message}
    </div>
  );
}

export function NewsBodyRenderer({
  displayMode,
  bodyHtml,
  body,
  isFirstImageLcp = false,
  locale = "ja",
  articleSlug,
}: NewsBodyRendererProps) {
  const handleBodyClick: MouseEventHandler<HTMLDivElement> | undefined =
    articleSlug
      ? (event) => {
          const anchor = (event.target as Element).closest("a");
          if (!anchor) return;
          // 埋め込みフォールバックは TrackedLink 自身が計測するため委譲対象外。
          if (anchor.closest('[data-testid="embed-shell"]')) return;

          const href = anchor.getAttribute("href");
          if (!href) return;
          const eventKey = articleBodyCtaKey(href, window.location.origin);
          if (!eventKey) return;
          trackCtaClick(eventKey, ARTICLE_BODY_CTA_LOCATION, undefined, {
            articleSlug,
          });
        }
      : undefined;

  if (displayMode === "html") {
    if (bodyHtml.trim().length > 0) {
      return renderBody(
        sanitizeNewsHtml(bodyHtml, STRICT_HTML_CONFIG, { isFirstImageLcp }),
        handleBodyClick,
      );
    }
    if (body.trim().length > 0) {
      console.warn(
        "[NewsBodyRenderer] displayMode=html だが bodyHtml が空のため body (rich) にフォールバック",
      );
      return renderBody(
        sanitizeNewsHtml(body, RICH_EDITOR_CONFIG, { isFirstImageLcp }),
        handleBodyClick,
      );
    }
    return renderEmpty(locale);
  }

  if (body.trim().length > 0) {
    return renderBody(
      sanitizeNewsHtml(body, RICH_EDITOR_CONFIG, { isFirstImageLcp }),
      handleBodyClick,
    );
  }
  if (bodyHtml.trim().length > 0) {
    return renderBody(
      sanitizeNewsHtml(bodyHtml, STRICT_HTML_CONFIG, { isFirstImageLcp }),
      handleBodyClick,
    );
  }
  return renderEmpty(locale);
}
