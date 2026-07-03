/**
 * 施策の効果検証レビューの純ロジック(改善案#5・記事の review-due と対称)。
 *
 * 施策提案 DB の `検証予定日`(date)が到来した施策を拾い、`仮説`＋`成功指標` から
 * 「検証結果」候補メモを作る。I/O は持たない(Notion 読み書き・LINE 通知は
 * proposal-review-due-cli.ts)。承認画面は Notion を読むだけ(プル型)で、
 * 最終判断(効いた/効かない)は人が決める。CLI は候補メモと検証済み日だけを書く。
 */

/** 検証予定日(到来判定に使う date プロパティ)。 */
export const PROPOSAL_REVIEW_DATE_PROP = "検証予定日";

/** 候補メモを書くプロパティ(効いたか/効かないかは人が最終決定)。 */
export const PROPOSAL_REVIEW_MEMO_PROP = "検証結果";

/** 二重に拾わないための「検証済み」記録日プロパティ。 */
export const PROPOSAL_REVIEW_DONE_PROP = "検証済み";

/** `YYYY-MM-DD` 厳密形式。Notion date の start(日付のみ)を素直に受ける。 */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 検証予定日を `YYYY-MM-DD` に正規化する。日付のみはそのまま、ISO 日時は日付部分を取る。
 * 妥当な日付でなければ null(不正・空・未設定は「拾わない」に倒す=沈黙落ちしない)。
 */
function normalizeDueDate(dueDate: string | null | undefined): string | null {
  const trimmed = (dueDate ?? "").trim();
  if (!trimmed) return null;
  const datePart = trimmed.split("T")[0];
  if (!DATE_ONLY_RE.test(datePart)) return null;
  // 実在日か(2026-02-31 等の弾き)を Date で検証する。
  const parsed = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return datePart;
}

/**
 * 検証予定日が到来しているか(dueDate <= today)。
 * @param dueDate Notion `検証予定日` の start(日付 or ISO 日時。未設定は null)。
 * @param todayIso 今日(`YYYY-MM-DD`)。
 */
export function isProposalReviewDue(
  dueDate: string | null | undefined,
  todayIso: string,
): boolean {
  const due = normalizeDueDate(dueDate);
  if (!due) return false;
  return due <= todayIso;
}

/**
 * 検証結果の候補文を作る(施策名＋仮説＋成功指標)。
 * 効いた/効かないの最終判断は人が決めるので、ここは突き合わせの足場だけ書く。
 */
export function buildProposalReviewMemo(
  name: string,
  hypothesis: string,
  successMetric: string,
): string {
  const parts: string[] = [];
  const h = hypothesis.trim();
  const s = successMetric.trim();
  if (h) parts.push(`仮説: ${h}`);
  if (s) parts.push(`成功指標: ${s}`);
  const body = parts.length > 0 ? parts.join(" ／") : "判定材料が少ない";
  return `[検証予定日到来] ${name.trim()} — ${body}`;
}
