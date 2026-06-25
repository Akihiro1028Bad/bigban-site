/**
 * 「完了/提示系」の LINE 通知を Flex Message(カード型UI)に整形する汎用ビルダー(#162)。
 * I/O を持たずテスト可能。送信は line.ts の pushFlexMessage が担い、Flex 非対応環境向けの
 * フォールバック文(altText)は各ドメインの既存テキストビルダーを流用する。
 *
 * 失敗通知は対象外(#24「沈黙させない」の確実性を優先し、失敗はテキストのまま据え置く)。
 */

import type { FlexBox, FlexBubble, FlexComponent } from "./digest-flex";

const COLOR_HEADING = "#111827";
const COLOR_SUB = "#6b7280";

export interface NoticeFlexInput {
  /** ヘッダー見出し(絵文字込み可)。例: "🎨 アイキャッチを再生成しました"。 */
  heading: string;
  /** 主見出し(記事タイトル等)。 */
  title: string;
  /** 補足行。空文字・空白のみの行は除外する。未指定は無し。 */
  lines?: readonly string[];
  /** 承認画面 URL(フッターの URI ボタン)。 */
  approveUrl: string;
  /** ボタンラベル(既定: 承認画面で確認)。 */
  buttonLabel?: string;
}

/**
 * 完了/提示系の通知カードを組む。タイトル(bold) + 補足行 + 承認画面 URI ボタン。
 * revise-flex.ts / digest-flex.ts と同じ作法。
 */
export function buildNoticeFlex(input: NoticeFlexInput): FlexBubble {
  const header: FlexBox = {
    type: "box",
    layout: "vertical",
    contents: [
      { type: "text", text: input.heading, weight: "bold", size: "md", color: COLOR_HEADING, wrap: true },
    ],
  };

  const lineComponents: FlexComponent[] = (input.lines ?? [])
    .filter((line) => line.trim() !== "")
    .map((line) => ({ type: "text", text: line, size: "sm", color: COLOR_SUB, wrap: true }));

  const body: FlexBox = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      { type: "text", text: input.title, weight: "bold", size: "sm", color: COLOR_HEADING, wrap: true },
      ...lineComponents,
    ],
  };

  const footer: FlexBox = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "button",
        style: "primary",
        height: "sm",
        action: { type: "uri", label: input.buttonLabel ?? "承認画面で確認", uri: input.approveUrl },
      },
    ],
  };

  return { type: "bubble", header, body, footer };
}
