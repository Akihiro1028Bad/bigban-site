import Link from "next/link";

import type { CSSProperties } from "react";

// ルートレイアウト(app/layout.tsx)は <html>/<body> を持たず、それらは
// [locale]/layout.tsx 側で描画される。そのため、ロケールに解決されない
// リクエスト（不正な locale・未マッチ URL 等）の not-found は、html/body を
// 持たないルートレイアウト直下で描画される。ここで自前に document 構造を
// 用意することで「Missing <html> and <body> tags in the root layout」を防ぐ。
// globals.css / next-intl のロケール文脈に依存しないよう、文言は日本語固定・
// スタイルはインラインで自己完結させる。
const bodyStyle: CSSProperties = {
  margin: 0,
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.25rem",
  backgroundColor: "#0A0A0A",
  color: "#F5F2EE",
  fontFamily:
    "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif",
  textAlign: "center",
  padding: "2rem",
};

const linkStyle: CSSProperties = {
  color: "#0A0A0A",
  backgroundColor: "#C8FF00",
  padding: "0.75rem 2rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textDecoration: "none",
};

export default function GlobalNotFound() {
  return (
    <html lang="ja">
      <body style={bodyStyle}>
        <p style={{ margin: 0, fontSize: "3rem", fontWeight: 800, letterSpacing: "0.1em" }}>
          404
        </p>
        <p style={{ margin: 0, color: "#8A8A8A" }}>
          ページが見つかりませんでした。
        </p>
        <Link href="/" style={linkStyle}>
          ホームへ戻る
        </Link>
      </body>
    </html>
  );
}
