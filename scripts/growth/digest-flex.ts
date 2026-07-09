/**
 * 週次スナップショットを LINE の Flex Message(カード型UI)に整形する純関数。
 *
 * テキスト版(buildDigestMessage)は altText のフォールバックに使い、こちらは
 * 指標を色付き・CTA をボタン化してタップ導線を上部/フッターに明確化する。
 * I/O を持たずテスト可能にする。送信は line.ts の pushFlexMessage が担う。
 */

import type { DigestInput, MetricValue } from "./digest";

type FlexSpacing = "xs" | "sm" | "md" | "lg" | "xl";

export interface FlexText {
  type: "text";
  text: string;
  weight?: "regular" | "bold";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  color?: string;
  wrap?: boolean;
  flex?: number;
  align?: "start" | "end" | "center";
  /** 行数の上限(0=無制限)。タイトル/抜粋の省略表示に使う。 */
  maxLines?: number;
}

export interface FlexButton {
  type: "button";
  style?: "primary" | "secondary" | "link";
  height?: "sm" | "md";
  action: { type: "uri"; label: string; uri: string };
}

export interface FlexImage {
  type: "image";
  url: string;
  size?: "full" | "md" | "sm";
  /** 例: "16:9"。アスペクト比を固定して CLS を防ぐ。 */
  aspectRatio?: string;
  aspectMode?: "cover" | "fit";
}

export interface FlexBox {
  type: "box";
  layout: "vertical" | "horizontal" | "baseline";
  contents: FlexComponent[];
  spacing?: FlexSpacing;
  margin?: FlexSpacing;
  flex?: number;
  // バッジ(ピル)表現用の任意スタイル。
  backgroundColor?: string;
  cornerRadius?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  paddingAll?: FlexSpacing;
  paddingStart?: FlexSpacing;
  paddingEnd?: FlexSpacing;
  paddingTop?: FlexSpacing;
  paddingBottom?: FlexSpacing;
}

export type FlexComponent = FlexText | FlexButton | FlexImage | FlexBox;

export interface FlexBubble {
  type: "bubble";
  hero?: FlexImage;
  header?: FlexBox;
  body?: FlexBox;
  footer?: FlexBox;
}

/** 複数バブルを横並びにするカルーセル(最大12バブル)。 */
export interface FlexCarousel {
  type: "carousel";
  contents: FlexBubble[];
}

/** push できる Flex のコンテナ(単一バブル or カルーセル)。 */
export type FlexContainer = FlexBubble | FlexCarousel;

const MAX_TOP_ACTIONS = 3;
const COLOR_UP = "#16a34a"; // 緑(改善)
const COLOR_DOWN = "#dc2626"; // 赤(悪化)
const COLOR_FLAT = "#6b7280"; // グレー(横ばい/データなし)
const COLOR_WARN = "#d97706"; // amber(警告)
const COLOR_HEADING = "#111827";

function formatInt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 大きいほど良い指標の前週比(語と色)。 */
function biggerBetter(m: MetricValue): { phrase: string; color: string } {
  if (m.deltaPct === null) return { phrase: "(前週データなし)", color: COLOR_FLAT };
  if (m.deltaPct === 0) return { phrase: "前週から横ばい", color: COLOR_FLAT };
  const up = m.deltaPct > 0;
  return {
    phrase: `前週より${Math.abs(m.deltaPct)}%${up ? "増" : "減"}`,
    color: up ? COLOR_UP : COLOR_DOWN,
  };
}

/** 掲載順位(小さいほど良い)の前週比(語と色)。 */
function positionMeta(m: MetricValue): { phrase: string; color: string } {
  if (m.deltaPct === null) return { phrase: "(前週データなし)", color: COLOR_FLAT };
  if (m.current === m.prior) return { phrase: "前週から横ばい", color: COLOR_FLAT };
  const improved = m.current < m.prior;
  return {
    phrase: improved ? "前週より改善" : "前週より悪化",
    color: improved ? COLOR_UP : COLOR_DOWN,
  };
}

function metricRow(label: string, value: string, phrase: string, color: string): FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: `${label} ${value}`, size: "sm", color: COLOR_HEADING, flex: 5, wrap: true },
      { type: "text", text: phrase, size: "sm", color, align: "end", flex: 4 },
    ],
  };
}

function metricRows(input: DigestInput): FlexBox[] {
  const rows: FlexBox[] = [];
  const m = input.metrics;
  if (m.sessions) {
    const { phrase, color } = biggerBetter(m.sessions);
    rows.push(metricRow("サイト訪問", `${formatInt(m.sessions.current)}回`, phrase, color));
  }
  if (m.clicks) {
    const { phrase, color } = biggerBetter(m.clicks);
    rows.push(metricRow("検索からの訪問", `${formatInt(m.clicks.current)}回`, phrase, color));
  }
  if (m.impressions) {
    const { phrase, color } = biggerBetter(m.impressions);
    rows.push(metricRow("表示回数", `${formatInt(m.impressions.current)}回`, phrase, color));
  }
  if (m.position) {
    const { phrase, color } = positionMeta(m.position);
    rows.push(metricRow("検索順位", `${m.position.current.toFixed(1)}位`, phrase, color));
  }
  return rows;
}

function warningTexts(input: DigestInput): FlexText[] {
  return (input.warnings ?? []).map((text) => ({
    type: "text",
    text,
    size: "sm",
    weight: "bold",
    color: COLOR_WARN,
    wrap: true,
  }));
}

function actionTexts(input: DigestInput): FlexComponent[] {
  if (input.topActions.length === 0) return [];
  const heading: FlexText = {
    type: "text",
    text: "■ 今週やること",
    weight: "bold",
    size: "sm",
    color: COLOR_HEADING,
  };
  const items: FlexText[] = input.topActions.slice(0, MAX_TOP_ACTIONS).map((action, i) => ({
    type: "text",
    text: `${i + 1}. ${action}`,
    size: "sm",
    color: COLOR_HEADING,
    wrap: true,
  }));
  return [heading, ...items];
}

function reportSummaryTexts(input: DigestInput): FlexComponent[] {
  const contents: FlexComponent[] = [];
  const discussion = input.reportSummary?.discussion ?? [];
  if (discussion.length > 0) {
    contents.push({
      type: "text",
      text: "■ 論点",
      weight: "bold",
      size: "sm",
      color: COLOR_HEADING,
    });
    discussion.forEach((line) => {
      contents.push({ type: "text", text: `・${line}`, size: "sm", color: COLOR_FLAT, wrap: true });
    });
  }

  const dataNotes = input.reportSummary?.dataNotes ?? [];
  if (dataNotes.length > 0) {
    contents.push({
      type: "text",
      text: "■ データ注意",
      weight: "bold",
      size: "sm",
      color: COLOR_HEADING,
    });
    dataNotes.forEach((line) => {
      contents.push({ type: "text", text: `・${line}`, size: "sm", color: COLOR_FLAT, wrap: true });
    });
  }

  return contents;
}

function passphraseText(input: DigestInput): FlexText | undefined {
  const passphrase = input.passphrase?.trim();
  if (!passphrase) return undefined;
  return {
    type: "text",
    text: `🔑 合言葉: ${passphrase}`,
    weight: "bold",
    size: "sm",
    color: COLOR_HEADING,
    wrap: true,
  };
}

function footerButtons(input: DigestInput): FlexBox | undefined {
  const contents: FlexComponent[] = [];
  const passphrase = passphraseText(input);
  if (passphrase) contents.push(passphrase);
  if (input.approveUrl) {
    contents.push({
      type: "button",
      style: "primary",
      height: "sm",
      action: { type: "uri", label: "✅ 承認する", uri: input.approveUrl },
    });
  }
  if (input.reportUrl) {
    contents.push({
      type: "button",
      style: "secondary",
      height: "sm",
      action: { type: "uri", label: "📄 レポートを見る", uri: input.reportUrl },
    });
  }
  if (contents.length === 0) return undefined;
  return { type: "box", layout: "vertical", spacing: "sm", contents };
}

/** 週次ダイジェストを Flex の bubble にする。 */
export function buildDigestFlex(input: DigestInput): FlexBubble {
  const header: FlexBox = {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `📊 今週のグロース`,
        weight: "bold",
        size: "lg",
        color: COLOR_HEADING,
      },
      { type: "text", text: input.periodLabel, size: "sm", color: COLOR_FLAT },
    ],
  };

  const bodyContents: FlexComponent[] = [
    ...warningTexts(input),
    ...metricRows(input),
    ...actionTexts(input),
    { type: "text", text: `承認待ち ${input.pendingCount}件`, weight: "bold", size: "sm", color: COLOR_HEADING },
    ...reportSummaryTexts(input),
  ];

  const body: FlexBox = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: bodyContents,
  };

  const footer = footerButtons(input);

  return footer
    ? { type: "bubble", header, body, footer }
    : { type: "bubble", header, body };
}
