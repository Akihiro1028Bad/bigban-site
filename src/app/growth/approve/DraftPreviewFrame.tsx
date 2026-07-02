"use client";

import { useEffect, useRef } from "react";

import {
  buildPreviewMessage,
  isAllowedPreviewOrigin,
  isDraftReadyMessage,
} from "@/lib/growth/draftPreview";

interface DraftPreviewFrameProps {
  html: string;
  title: string;
  className?: string;
}

// iframe が読み込む本番テーマ適用ルート((growth-preview)/draft-frame)。
const PREVIEW_FRAME_SRC = "/draft-frame";

/**
 * 下書きライブプレビューの iframe ラッパ(#100 / handshake 化 #F2)。
 *
 * /draft-frame((growth-preview) 配下・globals.css 適用) を読み込み、本文 HTML を
 * postMessage で送る。iframe は別ドキュメントなので本番テーマ CSS が枠内だけに
 * 適用され、管理画面(白テーマ)を汚染しない。送信先 origin は自オリジンに限定。
 *
 * handshake(#F2): 以前は iframe の onLoad で単発 post していたが、子(DraftFrameClient)
 * の message リスナー登録(useEffect)が間に合わず本文を取りこぼすレースがあった。
 * 現在は子からの ready メッセージ受信を起点に post する。
 *  - ready 受信時: その時点の最新 html を post(ref で stale closure を回避)。
 *  - 以後 html 変化時: ready 済みなら再 post(DraftEditWorkspace の live 更新は従来どおり)。
 *  - event.source で自 iframe からの ready のみ受理(複数/再マウント iframe の混線防止)。
 *
 * iframe.contentWindow への薄い DOM 結線のためカバレッジ対象外(vitest.config.ts)。
 * 純ロジック(メッセージ整形/検証)は draftPreview.ts でテスト済み、受信側の描画は
 * DraftFrameClient.test.tsx でテスト済み。data-preview-html は親側テストの観測点。
 */
export function DraftPreviewFrame({ html, title, className }: DraftPreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // ready 受信時に「その時点の最新 html」を送るための ref(stale closure 回避)。
  const htmlRef = useRef(html);
  // 子が ready を送ってきたか。ready 前の html 変化では post しない。
  const readyRef = useRef(false);

  // 最新 html を ref に同期(ready 受信時に stale closure を避けて最新を送るため)。
  useEffect(() => {
    htmlRef.current = html;
  }, [html]);

  // 子からの ready を待ち受け、受信したら最新 html を post する(1回だけ購読)。
  useEffect(() => {
    function handleReady(event: MessageEvent) {
      const frameWindow = frameRef.current?.contentWindow;
      // 自 iframe 以外(別の DraftPreviewFrame・無関係な frame)からの ready は無視。
      if (!frameWindow || event.source !== frameWindow) return;
      if (!isAllowedPreviewOrigin(event.origin, window.location.origin)) return;
      if (!isDraftReadyMessage(event.data)) return;
      readyRef.current = true;
      frameWindow.postMessage(
        buildPreviewMessage(htmlRef.current),
        window.location.origin,
      );
    }
    window.addEventListener("message", handleReady);
    return () => window.removeEventListener("message", handleReady);
  }, []);

  // ready 後の html 変化はそのまま再 post(ライブ更新)。ready 前は ready 受信時にまとめて送る。
  useEffect(() => {
    if (!readyRef.current) return;
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(buildPreviewMessage(html), window.location.origin);
  }, [html]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      src={PREVIEW_FRAME_SRC}
      sandbox="allow-scripts allow-same-origin"
      className={className}
      data-preview-html={html}
    />
  );
}
