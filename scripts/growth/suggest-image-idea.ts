import type { RequestedBodyImageStyle } from "./body-image";

type IdeaEntry = {
  pattern: RegExp;
  idea: (topic: string) => string;
};

const NEUTRAL_TOPIC = "このセクション";

const IDEA_DICT: Record<RequestedBodyImageStyle, IdeaEntry[]> = {
  court: [
    {
      pattern: /(ルール|規格|コート|広さ|区画)/,
      idea: (topic) => `${topic}を俯瞰コート図で示す`,
    },
    {
      pattern: /(位置|場所|動き|ライン|ネット)/,
      idea: (topic) => `${topic}の位置関係を俯瞰コート図で整理する`,
    },
  ],
  flow: [
    {
      pattern: /(手順|流れ|ステップ|予約|始め方|はじめ方)/,
      idea: (topic) => `${topic}の手順をフロー図で示す`,
    },
    {
      pattern: /(準備|受付|申込|体験|参加)/,
      idea: (topic) => `${topic}までの流れをフロー図で整理する`,
    },
  ],
  infographic: [
    {
      pattern: /(比較|違い|選び方|どっち|メリット)/,
      idea: (topic) => `${topic}を比較インフォグラフィックで示す`,
    },
    {
      pattern: /(ポイント|特徴|理由|注意|コツ)/,
      idea: (topic) => `${topic}の要点をインフォグラフィックで整理する`,
    },
  ],
  mascot: [
    {
      pattern: /(初心者|初めて|はじめ|入門|基本|ルール)/,
      idea: (topic) => `宇宙人が${topic}をやさしく案内する`,
    },
    {
      pattern: /(コート|施設|広さ|スペース)/,
      idea: (topic) => `宇宙人が${topic}を指し示す`,
    },
    {
      pattern: /(比較|選び方|違い|どっち)/,
      idea: (topic) => `宇宙人が${topic}を見比べる`,
    },
    {
      pattern: /(予約|申込|参加|体験|レッスン)/,
      idea: (topic) => `宇宙人が${topic}へ誘う`,
    },
  ],
  illust: [
    {
      pattern: /(雰囲気|空間|施設|体験|楽し|過ご)/,
      idea: (topic) => `${topic}の雰囲気を抽象イラストで表す`,
    },
    {
      pattern: /(集中|リラックス|交流|気軽|安心)/,
      idea: (topic) => `${topic}の感覚を抽象イラストで表す`,
    },
  ],
  auto: [
    {
      pattern: /(ルール|規格|コート|広さ|区画)/,
      idea: (topic) => `${topic}に合う図を提案する`,
    },
    {
      pattern: /(手順|流れ|ステップ|予約|始め方|はじめ方)/,
      idea: (topic) => `${topic}の流れが伝わる図を提案する`,
    },
    {
      pattern: /(比較|違い|選び方|どっち|メリット)/,
      idea: (topic) => `${topic}を比べやすい図で提案する`,
    },
  ],
};

const FALLBACK_IDEAS: Record<RequestedBodyImageStyle, (topic: string) => string> = {
  auto: () => "このセクションに合う図を提案する",
  mascot: (topic) => `宇宙人が${topic}を楽しく紹介する`,
  illust: (topic) => `${topic}の雰囲気を抽象イラストで表す`,
  court: (topic) => `${topic}を俯瞰コート図で整理する`,
  flow: (topic) => `${topic}の流れをフロー図で整理する`,
  infographic: (topic) => `${topic}の要点をインフォグラフィックで整理する`,
};

function topicOf(heading: string): string {
  const topic = heading.trim().replace(/\s+/g, " ");
  return topic || NEUTRAL_TOPIC;
}

export function suggestImageIdea(heading: string, style: RequestedBodyImageStyle): string {
  const topic = topicOf(heading);
  if (topic === NEUTRAL_TOPIC && style === "auto") {
    return FALLBACK_IDEAS.auto(topic);
  }
  for (const { pattern, idea } of IDEA_DICT[style]) {
    if (pattern.test(topic)) return idea(topic);
  }
  return FALLBACK_IDEAS[style](topic);
}
