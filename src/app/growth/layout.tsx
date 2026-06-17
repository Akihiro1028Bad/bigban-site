import type { Metadata } from "next";

/**
 * グロース系ページ(/growth/*)用のレイアウト。
 *
 * ルート layout.tsx は素通し(html/body は [locale] 側にある)ため、
 * locale 外のこのルートでは自前で html/body を与える。
 * サイト本体の暗いテーマ(globals.css)は読み込まず、ブラウザ既定の
 * 読みやすい配色(白背景・黒文字)にする。管理用なので noindex。
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function GrowthLayout({
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
