"use client";

import { useEffect, useState } from "react";

import { NewsBodyRenderer } from "@/components/news/NewsBodyRenderer";
import {
  buildDraftReadyMessage,
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
 *
 * handshake(#F2): message リスナー登録の完了後に親へ ready を送る。親の
 * onLoad 起点の単発送信は、子の useEffect 実行(リスナー登録)が間に合わず
 * 本文を取りこぼすレースがあった。ready を起点に親が post することで、
 * タイミングに依存せず確実に本文が届く。送信先 origin は親(自オリジン)に限定。
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
    // リスナー登録後に ready を親へ通知。親子同一オリジンのため送信先も自オリジン。
    window.parent.postMessage(buildDraftReadyMessage(), window.location.origin);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <NewsBodyRenderer displayMode="html" bodyHtml={html} body="" locale="ja" />
  );
}
