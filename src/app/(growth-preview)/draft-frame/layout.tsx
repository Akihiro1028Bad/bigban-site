import type { Metadata } from "next";

import "../../globals.css";

/**
 * 下書きライブプレビュー iframe 専用レイアウト(#100)。
 *
 * 管理画面(/growth/*)は白テーマ(growth.css)だが、このルートは本番ニュースと
 * 同じ globals.css(暗テーマ・typography・.news-body 装飾)を読み込む。
 * iframe は別ドキュメントなので、globals.css の html{暗背景} 等は枠内だけに
 * 適用され、親の管理画面(白テーマ)を汚染しない。管理用なので noindex。
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DraftFrameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
