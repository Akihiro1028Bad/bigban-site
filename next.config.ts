import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { PROMPT_REGISTRY } from "./scripts/growth/promptRegistry";

/**
 * News 詳細・一覧ページ向け CSP (Content-Security-Policy)。
 *
 * 現在は Report-Only モードで運用し、違反ログを 1 週間収集後に
 * Content-Security-Policy (enforce) に切り替える計画 (別 PR)。
 *
 * frame-src:
 *   - 'self': 同一オリジンのみ
 *   - https://www.youtube-nocookie.com: YouTube プライバシー強化埋め込み専用
 *   - https://www.instagram.com: Instagram 投稿埋め込み専用
 *   - 他プロバイダ追加時はここに 1 行ずつ足す
 */
const NEWS_CSP_REPORT_ONLY = [
  "frame-src 'self' https://www.youtube-nocookie.com https://www.instagram.com",
].join("; ");

/** プロンプトAPIが実行時に読む静的ファイル。表示マニフェストから機械的に導出する。 */
export const PROMPT_TRACING_INCLUDES = [
  ...PROMPT_REGISTRY.map((entry) => `./${entry.path}`),
  "./scripts/growth/facility-context.json",
];

const nextConfig: NextConfig = {
  // プロンプト確認 API(/api/growth/prompts)は実行時に、各フェーズのプロンプト・few-shot 例・
  // 参考ドキュメント・前提情報を読む。サーバーレス関数のバンドルへ確実に同梱させる。
  outputFileTracingIncludes: {
    "/api/growth/prompts": PROMPT_TRACING_INCLUDES,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.microcms-assets.io",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:locale(ja|en)?/news/:path*",
        headers: [
          {
            key: "Content-Security-Policy-Report-Only",
            value: NEWS_CSP_REPORT_ONLY,
          },
        ],
      },
      {
        // 承認ページはHttpOnly Cookie sessionを使う。認証画面・盤の
        // キャッシュ保持と外部へのReferrer送信を防ぐ。
        source: "/growth/approve",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
