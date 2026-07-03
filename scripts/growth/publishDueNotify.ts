/**
 * 予約公開 CLI(publish-due)の失敗・スキップ通知本文(#220 / P1⑥)。純ロジック。
 *
 * これまで総失敗は console のみ・不正 contentId は console.warn でスキップだった。
 * 予約公開が cron ごと落ちても、あるいは一部記事が公開されず取り残されても、ログを
 * 読むまで気づけない。publish-draft と対称に LINE 通知できるよう本文を組み立てる。
 */

/** 予約公開 cron が総失敗したときの LINE 本文(沈黙させない)。 */
export function buildPublishDueFailureMessage(reason: string): string {
  return [
    "❌ 予約公開(publish-due)が失敗しました。到来分が公開されていない可能性があります。",
    `理由: ${reason}`,
    "ログを確認し、復旧後に npm run growth:publish-due を再実行してください。",
  ].join("\n");
}

/** 不正 contentId でスキップした記事の識別情報。 */
export interface SkippedPublication {
  title: string;
  contentId: string;
}

/**
 * 不正 contentId でスキップした記事の LINE 本文。空配列なら通知不要=null。
 * タイトル空は (無題) にフォールバックし、下書きID を併記して特定できるようにする。
 */
export function buildPublishDueSkipMessage(skipped: readonly SkippedPublication[]): string | null {
  if (skipped.length === 0) return null;
  const lines = [
    "⚠️ 予約公開で不正な下書きIDのため公開をスキップした記事があります(取り残し防止に確認を):",
  ];
  for (const s of skipped) {
    const title = s.title.trim() || "(無題)";
    lines.push(`・${title}(下書きID: ${s.contentId || "空"})`);
  }
  return lines.join("\n");
}
