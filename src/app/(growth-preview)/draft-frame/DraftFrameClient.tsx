"use client";

import { useEffect, useState } from "react";

import { NewsBodyRenderer } from "@/components/news/NewsBodyRenderer";
import {
  isAllowedPreviewOrigin,
  parsePreviewMessage,
} from "@/lib/growth/draftPreview";

/**
 * 下書きライブプレビュー iframe の中身(#100)。
 *
 * 親(ApproveClient)から postMessage で届いた本文 HTML を、本番と同じ
 * NewsBodyRenderer で描画する。このコンポーネントは globals.css を読み込む
 * (growth-preview) レイアウト配下で動くため、本番そのままの見た目になる。
 *
 * - origin は自オリジンに限定(isAllowedPreviewOrigin)。
 * - data はホワイトリスト検証(parsePreviewMessage)後のみ反映。
 * - 受信 HTML は NewsBodyRenderer 内で sanitizeNewsHtml(STRICT) される。
 */
export function DraftFrameClient() {
  const [html, setHtml] = useState("");

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isAllowedPreviewOrigin(event.origin, window.location.origin)) {
        return;
      }
      const message = parsePreviewMessage(event.data);
      if (!message) return;
      setHtml(message.html);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <NewsBodyRenderer displayMode="html" bodyHtml={html} body="" locale="ja" />
  );
}
