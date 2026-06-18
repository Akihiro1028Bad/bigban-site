/**
 * 施設の「前提コンテキスト(事実・現況)」の単一ソース。
 *
 * `facility-context.json` を唯一の正典として読み込み、実行時の基準日から
 * 「開業前 / 開業済み・残り(経過)日数」を算出し、記事生成エージェントへ注入する
 * Markdown ブロックを生成する純関数群。
 *
 * 目的: パイプラインが「いまこの施設はどういう状況か」を毎回同じ根拠で参照し、
 * 開業時期のズレ(例: 開業済みなのに「春を待っています」)や、未確定情報の
 * 推測記述を構造的に防ぐ。
 *
 * 日付境界は週次処理(period.ts)と揃え、日本時間(JST, +09:00)基準で判定する。
 */

import { z } from "zod";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type FacilityPhase = "pre-open" | "open";

export interface FacilityPhaseResult {
  phase: FacilityPhase;
  /** pre-open のとき開業までの残り日数、open のとき開業からの経過日数(いずれも非負) */
  days: number;
}

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定してください");

const facilityContextSchema = z.object({
  name: z.string().min(1),
  openDate: ymd,
  location: z.array(z.string().min(1)),
  confirmed: z.array(z.string().min(1)),
  doNotWrite: z.array(z.string().min(1)),
  notes: z.string().optional(),
});

export type FacilityContextData = z.infer<typeof facilityContextSchema>;

/** 未知の入力を検証して FacilityContextData にする(不正なら例外)。 */
export function parseFacilityContextData(input: unknown): FacilityContextData {
  return facilityContextSchema.parse(input);
}

/** JST のカレンダー日付に対応する UTC 0時の Date を返す。 */
function jstMidnight(reference: Date): Date {
  const shifted = new Date(reference.getTime() + JST_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate()
    )
  );
}

/** 開業日と基準日から、開業前/開業済みと日数差を算出する。 */
export function resolveFacilityPhase(
  openDate: string,
  reference: Date
): FacilityPhaseResult {
  const open = new Date(`${openDate}T00:00:00Z`);
  const today = jstMidnight(reference);
  const diffDays = Math.round((today.getTime() - open.getTime()) / MS_PER_DAY);
  if (diffDays < 0) {
    return { phase: "pre-open", days: -diffDays };
  }
  return { phase: "open", days: diffDays };
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * 基準日(JST)を YYYY-MM-DD で返す。プロンプトに刻む基準日の表記に使う。
 */
function jstDateLabel(reference: Date): string {
  const m = jstMidnight(reference);
  const year = m.getUTCFullYear();
  const month = String(m.getUTCMonth() + 1).padStart(2, "0");
  const day = String(m.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 記事生成エージェントへ注入する「前提コンテキスト」Markdown を生成する。
 * 最優先・正典として扱われる前提で、矛盾の禁止と未確定情報の扱いを明示する。
 */
export function renderFacilityContext(
  data: FacilityContextData,
  reference: Date
): string {
  const { phase, days } = resolveFacilityPhase(data.openDate, reference);
  const statusLine =
    phase === "open"
      ? `**開業済み**(開業日 ${data.openDate} / 開業から${days}日)。営業中の施設として書く。「開業を待つ/春を待つ」等の開業前の表現は使わない。`
      : `**開業前**(開業日 ${data.openDate} / 開業まで${days}日)。開業準備中・開業予定として書く。`;

  const notesBlock = data.notes ? `\n\n補足: ${data.notes}` : "";

  return [
    "# 施設の前提コンテキスト(正典・最優先)",
    "",
    `この施設について書くときの唯一の正典。記事は以下と矛盾してはいけない。古い前提・推測で書かない。`,
    "",
    `- 施設名: ${data.name}`,
    `- 基準日(JST): ${jstDateLabel(reference)}`,
    `- ステータス: ${statusLine}`,
    "",
    "## 確定している事実(これと矛盾しない)",
    bullets(data.confirmed),
    "",
    "## 立地・アクセス(裏取り済み)",
    bullets(data.location),
    "",
    "## 書いてはいけない / 断定してはいけない項目",
    "未確定のため推測で書かない。触れる必要があるときは断定せず「最新情報をご確認ください」と促す。",
    bullets(data.doNotWrite),
    notesBlock,
    "",
    "(この前提は scripts/growth/facility-context.json が単一ソース。更新はそのファイルで行う。)",
  ].join("\n");
}
