/**
 * 画像指示の純ロジック(#proto・再設計・DOM非依存)。
 *
 * house style(宇宙人マスコット×コスミック)はロック済みのため、可変点は
 * 「画像を出すか(mode)」と「宇宙人の行為(action 一言)」だけ。ここではその支援ロジックを集約する:
 * - suggestActions:   見出し/要約から action 候補を提案(空白恐怖の解消)
 * - migrateImageHint: 旧 imageHint("mascot: X" 等) を新 ImageInstruction へ正規化
 * - resolveAction:    プレビュー字幕に出す行為(custom は action、auto は見出しから推測)
 * - recommendOff:     画像不要そうなセクションの控えめな提案
 * - imagePlanSummary: タブ上部のプラン帯用の集計
 *
 * UI から切り離してテスト可能にする(本ファイルは src/lib/growth へ再エクスポートしない純UI用)。
 */
import type { ImageInstruction, OutlineSection } from "./types";

/** キーワード(正規表現) → action 候補。データ駆動で硬直化を避ける。 */
const ACTION_DICT: { pattern: RegExp; actions: string[] }[] = [
  { pattern: /(スイング|打ち?方|フォーム|ショット|サーブ)/, actions: ["スイングする", "ラケットを構える"] },
  { pattern: /(初心者|初めて|はじめ|入門|基本|ルール)/, actions: ["はじめてコートに立つ", "やさしく案内する"] },
  { pattern: /(コート|施設|広さ|面|スペース)/, actions: ["コートを見渡す", "コートの広さを指し示す"] },
  { pattern: /(カフェ|休憩|併設|ラウンジ|ドリンク)/, actions: ["カフェでくつろぐ"] },
  { pattern: /(比較|選び方|違い|どっち|vs|対決)/, actions: ["ラケットを持ち比べる", "見くらべて考える"] },
  { pattern: /(レンタル|手ぶら|道具|用具|パドル)/, actions: ["道具を手に取る"] },
  { pattern: /(予約|申込|参加|体験|レッスン)/, actions: ["手をあげて誘う", "ガッツポーズ"] },
  { pattern: /(まとめ|さいご|最後|結論|おわり)/, actions: ["手を振る", "ガッツポーズ"] },
];

const FALLBACK_ACTIONS = ["コートに立つ", "ガッツポーズ"];

/** 見出し+要約から action 候補を最大4件(重複なし)。常に1件以上返す。 */
export function suggestActions(section: OutlineSection): string[] {
  const text = `${section.heading} ${section.summary ?? ""}`;
  const out: string[] = [];
  for (const { pattern, actions } of ACTION_DICT) {
    if (pattern.test(text)) {
      for (const a of actions) if (!out.includes(a)) out.push(a);
    }
  }
  for (const a of FALLBACK_ACTIONS) if (!out.includes(a)) out.push(a);
  return out.slice(0, 4);
}

/**
 * 旧 imageHint を新 ImageInstruction へ正規化。
 * "mascot: 案内する宇宙人" / "diagram: 重さ比較" / "minimal: …" / プレフィクスなし、すべて action へ吸収。
 * 旧スタイル(mascot/minimal/diagram)は house style ロックにより破棄し、説明文だけ action として残す。
 */
export function migrateImageHint(hint: string | undefined): ImageInstruction | undefined {
  if (!hint) return undefined;
  const trimmed = hint.trim();
  if (!trimmed) return undefined;
  const m = trimmed.match(/^(mascot|minimal|diagram)\s*[:：]\s*(.+)$/i);
  const action = (m ? m[2] : trimmed).trim();
  if (!action) return undefined;
  return { mode: "custom", action };
}

/** プレビュー字幕に出す行為。custom は action、auto は見出し由来の推測、off は空。 */
export function resolveAction(section: OutlineSection, inst?: ImageInstruction): string {
  const effective = inst ?? section.imageInstruction;
  if (effective?.mode === "off") return "";
  if (effective?.mode === "custom" && effective.action?.trim()) return effective.action.trim();
  return suggestActions(section)[0] ?? FALLBACK_ACTIONS[0];
}

/**
 * 画像不要そうなセクションの控えめな提案(確定ではなく"提案")。
 * 末尾のCTA/まとめや、ごく短い繋ぎ見出しは画像オフが妥当なことが多い、という簡易ヒューリスティック。
 */
export function recommendOff(section: OutlineSection, index: number, total: number): boolean {
  const text = `${section.heading} ${section.summary ?? ""}`;
  if (/(まとめ|さいご|最後|結論|よくある質問|FAQ|お問い合わせ|申込|予約方法)/.test(text)) return true;
  // 最終セクションが CTA 的なら画像なしでも成立しやすい
  if (total >= 3 && index === total - 1 && /(ぜひ|お待ち|始め|参加|来店)/.test(text)) return true;
  return false;
}

/** ImageInstruction を mode へ正規化(undefined は auto 扱い)。 */
export function effectiveMode(inst?: ImageInstruction): ImageInstruction["mode"] {
  return inst?.mode ?? "auto";
}

/** プラン帯用集計: 画像を出す予定の枚数(off以外)と、明示指定済み(custom)の数。 */
export function imagePlanSummary(outline: OutlineSection[]): { planned: number; specified: number } {
  let planned = 0;
  let specified = 0;
  for (const s of outline) {
    const mode = effectiveMode(s.imageInstruction);
    if (mode !== "off") planned += 1;
    if (mode === "custom") specified += 1;
  }
  return { planned, specified };
}
