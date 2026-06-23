/**
 * 構成案修正の LINE 通知を Flex Message(カード型UI)に整形する純関数(#138)。
 * I/O を持たずテスト可能。送信は line.ts の pushFlexMessage が担い、
 * Flex 非対応環境向けのフォールバック文(altText)は revise.ts のテキスト builder を使う。
 */

import type { FlexBox, FlexBubble } from "./digest-flex";

const COLOR_HEADING = "#111827";
const COLOR_SUB = "#6b7280";
const COLOR_ACCENT = "#2563eb"; // 青(提示)
const COLOR_DANGER = "#dc2626"; // 赤(失敗)

/**
 * 複数行テキストから先頭 maxLines 行(空行は除外)を抜き出す。
 * 冒頭プレビュー用。空文字は空文字。
 */
export function excerptLines(text: string, maxLines: number): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, maxLines)
    .join("\n");
}

export interface RevisePresentFlexInput {
  title: string;
  approveUrl: string;
  instructionCount: number;
  proposalExcerpt: string;
  /** #139 B: AI が提案した新タイトル。空=タイトル提案なし。 */
  titleProposal?: string;
}

/** 修正案提示(成功)のリッチカード(#138 / #139 B)。承認画面 URI ボタン付き。 */
export function buildRevisePresentFlex(input: RevisePresentFlexInput): FlexBubble {
  const header: FlexBox = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "✏️ 構成案の修正案ができました",
        weight: "bold",
        size: "md",
        color: COLOR_HEADING,
        wrap: true,
      },
    ],
  };

  const body: FlexBox = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      { type: "text", text: input.title, weight: "bold", size: "sm", color: COLOR_HEADING, wrap: true },
      // 構成案コメントを反映した件数(タイトルのみ修正のときは 0 なので出さない)。
      ...(input.instructionCount > 0
        ? [
            {
              type: "text" as const,
              text: `${input.instructionCount}件の修正指示を反映`,
              size: "sm" as const,
              color: COLOR_ACCENT,
            },
          ]
        : []),
      // #139 B: 新タイトルの提案があれば見せる。
      ...(input.titleProposal
        ? [
            {
              type: "text" as const,
              text: `🆕 新タイトル: ${input.titleProposal}`,
              size: "sm" as const,
              color: COLOR_ACCENT,
              wrap: true,
            },
          ]
        : []),
      ...(input.proposalExcerpt
        ? [
            {
              type: "text" as const,
              text: input.proposalExcerpt,
              size: "sm" as const,
              color: COLOR_SUB,
              wrap: true,
              maxLines: 4,
            },
          ]
        : []),
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
        action: { type: "uri", label: "承認画面で確認", uri: input.approveUrl },
      },
    ],
  };

  return { type: "bubble", header, body, footer };
}

export interface ReviseFailFlexInput {
  title: string;
  approveUrl: string;
  reason: string;
}

/** 修正失敗のリッチカード(#138 / #24: 沈黙させない)。承認画面 URI ボタン付き。 */
export function buildReviseFailFlex(input: ReviseFailFlexInput): FlexBubble {
  const header: FlexBox = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "⚠️ 構成案の修正に失敗しました",
        weight: "bold",
        size: "md",
        color: COLOR_DANGER,
        wrap: true,
      },
    ],
  };

  const body: FlexBox = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      { type: "text", text: input.title, weight: "bold", size: "sm", color: COLOR_HEADING, wrap: true },
      { type: "text", text: `理由: ${input.reason}`, size: "sm", color: COLOR_SUB, wrap: true },
      {
        type: "text",
        text: "やり直し(再コメント)で再依頼できます。",
        size: "sm",
        color: COLOR_SUB,
        wrap: true,
      },
    ],
  };

  const footer: FlexBox = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "button",
        style: "secondary",
        height: "sm",
        action: { type: "uri", label: "承認画面を開く", uri: input.approveUrl },
      },
    ],
  };

  return { type: "bubble", header, body, footer };
}
