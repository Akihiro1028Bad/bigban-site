/**
 * 承認画面プレビュー用の独立ルート(#proto・本番忠実プレビュー)。
 *
 * DevicePreview から iframe で各端末幅で読み込む。iframe = 本物のビューポートなので、
 * 本番ニュース記事と同じビューポート基準のレスポンシブ(lg: 等)が正確に再現される。
 * 本文は本番と同一の PROSE_CLASS で描画し、「公開後の見た目」を忠実に映す。
 */
"use client";

import { useEffect, useRef } from "react";

import { useParams } from "next/navigation";

import { PROSE_CLASS } from "@/components/news/NewsBodyRenderer";

import { MOCK_ARTICLES } from "../../mockData";
// このルートは iframe で独立文書として読み込まれる。growth.css(白テーマ)ではなく
// 本番サイトのテーマ(globals.css: deep-black / prose / typography)を当て、公開後の見た目を忠実に再現する。
import "@/app/globals.css";

export default function PreviewFramePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const article = MOCK_ARTICLES.find((a) => a.id === id) ?? null;
  const rootRef = useRef<HTMLElement>(null);

  // 親(iframe)へ実コンテンツ高さを通知し、iframe を内容に合わせて自動リサイズさせる。
  useEffect(() => {
    const report = () => {
      const h = document.documentElement.scrollHeight;
      window.parent?.postMessage({ type: "proto-preview-height", id, height: h }, "*");
    };
    report();
    const ro = new ResizeObserver(report);
    if (rootRef.current) ro.observe(rootRef.current);
    window.addEventListener("load", report);
    const t = setTimeout(report, 300);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", report);
      clearTimeout(t);
    };
  }, [id]);

  if (!article) {
    return <div style={{ padding: 40, color: "#fff", background: "#0a0a0a" }}>記事が見つかりません。</div>;
  }

  return (
    <main ref={rootRef} className="min-h-screen bg-deep-black text-text-light pb-16 lg:pb-24">
      <article className="mx-auto max-w-3xl px-6 lg:px-12 py-8 lg:py-12">
        <div className="flex items-center gap-3 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-block px-2 py-0.5 border" style={{ borderColor: "#C8FF00", color: "#C8FF00" }}>
              お知らせ
            </span>
          </div>
          <time className="text-text-gray">2026.04.18</time>
        </div>

        <h1 className="mt-4 text-2xl lg:text-4xl font-bold leading-tight">{article.title}</h1>

        {article.hasEyecatch && article.eyecatchUrl && (
          <div className="mt-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URI のモック画像。本番は next/image(microCMS最適化)。 */}
            <img src={article.eyecatchUrl} alt="" className="w-full h-auto" />
          </div>
        )}

        <div className="mt-10">
          {/* 本番は NewsBodyRenderer がサニタイズして描画。プレビューは信頼できるモックHTMLを
              本番と同一の PROSE_CLASS で描画する(画像も表示し「どこに何が出るか」を忠実に再現)。 */}
          <div className={`news-body ${PROSE_CLASS}`} dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />
        </div>
      </article>
    </main>
  );
}
