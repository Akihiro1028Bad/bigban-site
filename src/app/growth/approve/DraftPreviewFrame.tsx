"use client";

import { useEffect, useRef, useState } from "react";

import { buildPreviewMessage } from "@/lib/growth/draftPreview";

interface DraftPreviewFrameProps {
  html: string;
  title: string;
  className?: string;
}

// iframe が読み込む本番テーマ適用ルート((growth-preview)/draft-frame)。
const PREVIEW_FRAME_SRC = "/draft-frame";

/**
 * 下書きライブプレビューの iframe ラッパ(#100)。
 *
 * /draft-frame((growth-preview) 配下・globals.css 適用) を読み込み、本文 HTML を
 * postMessage で送る。iframe は別ドキュメントなので本番テーマ CSS が枠内だけに
 * 適用され、管理画面(白テーマ)を汚染しない。送信先 origin は自オリジンに限定。
 *
 * iframe.contentWindow への薄い DOM 結線のためカバレッジ対象外(vitest.config.ts)。
 * 純ロジック(メッセージ整形/検証)は draftPreview.ts でテスト済み、受信側の描画は
 * DraftFrameClient.test.tsx でテスト済み。data-preview-html は親側テストの観測点。
 */
export function DraftPreviewFrame({ html, title, className }: DraftPreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(buildPreviewMessage(html), window.location.origin);
  }, [html, ready]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      src={PREVIEW_FRAME_SRC}
      sandbox="allow-scripts allow-same-origin"
      className={className}
      data-preview-html={html}
      onLoad={() => setReady(true)}
    />
  );
}
