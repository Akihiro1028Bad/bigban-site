export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqQuestionSchema {
  "@type": "Question";
  name: string;
  acceptedAnswer: {
    "@type": "Answer";
    text: string;
  };
}

export interface FaqPageSchema {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: FaqQuestionSchema[];
}

// 表示中の Q&A と一致する FAQPage 構造化データを生成する。
// 質問・回答は呼び出し側でロケール解決済みの文字列を渡す。
export function buildFaqPage(items: readonly FaqItem[]): FaqPageSchema {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
