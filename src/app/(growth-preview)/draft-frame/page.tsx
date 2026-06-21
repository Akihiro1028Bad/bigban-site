import { DraftFrameClient } from "./DraftFrameClient";

/**
 * 下書きライブプレビュー用 iframe のエントリ(#100)。
 * (growth-preview) レイアウトが globals.css(本番テーマ)を読み込むため、
 * ここで描画される本文は本番ニュースページと同じ見た目になる。
 */
export default function DraftFramePage() {
  return <DraftFrameClient />;
}
