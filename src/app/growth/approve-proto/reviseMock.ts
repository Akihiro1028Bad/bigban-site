/**
 * 修正ループ(#proto・#40)の擬似ロジック。
 *
 * 実機では PC の修正ループが claude で案を作るが、プロトタイプでは指示文から
 * それっぽい案を決定的に生成する(外部 I/O なし)。本番ロジックではない。
 */
import type { OutlineSection, ReviseField } from "./types";

/** 共通の接頭/接尾を除いた「変わった中身」を取り出す(日本語可)。 */
export interface SegDiff {
  prefix: string;
  removed: string;
  added: string;
  suffix: string;
}

export function segDiff(from: string, to: string): SegDiff {
  const max = Math.min(from.length, to.length);
  let p = 0;
  while (p < max && from[p] === to[p]) p++;
  let s = 0;
  while (s < max - p && from[from.length - 1 - s] === to[to.length - 1 - s]) s++;
  return {
    prefix: from.slice(0, p),
    removed: from.slice(p, from.length - s),
    added: to.slice(p, to.length - s),
    suffix: from.slice(from.length - s),
  };
}

const TITLE_SUBS: [RegExp, string][] = [
  [/やさしく/g, "ていねいに"],
  [/入門/g, "の基本"],
  [/とは？/g, "の基礎知識"],
  [/活用例/g, "使いどころ"],
  [/見どころと/g, "楽しみ方と"],
  [/失敗しない/g, "迷わない"],
];

/** タイトル修正案。指示に「短く」があれば短縮、なければ語の言い換えで自然に寄せる。 */
export function proposeTitle(from: string, hint: string): ReviseField {
  const h = hint ?? "";
  let to = from;
  if (h.includes("短")) {
    const cut = from.split(/[：:]/)[0];
    to = cut && cut !== from ? cut : from.slice(0, Math.max(12, Math.floor(from.length * 0.7)));
  } else {
    for (const [re, rep] of TITLE_SUBS) to = to.replace(re, rep);
    if (to === from) to = `${from.replace(/。$/, "")}｜はじめての方へ`;
  }
  return { from, to };
}

function hintSentence(hint: string): string {
  const h = hint ?? "";
  if (h.includes("具体") || h.includes("例")) {
    return "たとえば初回は、スタッフが横についてサーブとカウントだけ教えます。ラケットを握ったことがなくても大丈夫です。";
  }
  if (h.includes("内部リンク") || h.includes("導線") || h.includes("リンク")) {
    return "体験の予約方法は、施設紹介ページにまとめています。気になった方はあわせてご覧ください。";
  }
  if (h.includes("短") || h.includes("簡潔")) {
    return "まずは一度、コートに立ってみてください。";
  }
  return "読み手が次の一歩をイメージできるよう、具体的な情景をひとつ添えました。";
}

/**
 * 構成案修正案。コメントの付いたセクションは要約を磨き、コメントが「追加/足す」を
 * 含むなら末尾に CTA セクションを補う。コメント自体は反映済みとして落とす。
 */
export function proposeOutline(sections: OutlineSection[]): OutlineSection[] {
  const hasComment = sections.some((s) => (s.comments?.length ?? 0) > 0);
  const wantsAdd = sections.some((s) =>
    (s.comments ?? []).some((c) => c.includes("追加") || c.includes("足") || c.includes("CTA"))
  );
  const next: OutlineSection[] = sections.map((s) => {
    const c = s.comments?.[0];
    if (!c) return { ...s, comments: undefined };
    return {
      ...s,
      summary: s.summary ? `${s.summary}（指示反映: ${c.slice(0, 14)}…）` : `指示反映: ${c}`,
      comments: undefined,
    };
  });
  if (hasComment && wantsAdd && !sections.some((s) => s.heading.includes("予約") || s.heading.includes("まとめ"))) {
    next.push({ heading: "次の一歩（体験予約への導線）", summary: "内部リンクで予約ページへ" });
  }
  return next;
}

/** 本文修正案。冒頭の段落に一文を足し、変更箇所を proto-changed で印付けする。 */
export function proposeBody(from: string, hint: string): ReviseField {
  const sentence = hintSentence(hint);
  const open = from.indexOf("<p>");
  const close = from.indexOf("</p>");
  let to: string;
  if (open === -1 || close === -1 || open > close) {
    to = `<p class="proto-changed">${sentence}</p>${from}`;
  } else {
    const before = from.slice(0, open);
    const inner = from.slice(open + 3, close);
    const after = from.slice(close + 4);
    to = `${before}<p class="proto-changed">${inner}<br />${sentence}</p>${after}`;
  }
  return { from, to };
}
