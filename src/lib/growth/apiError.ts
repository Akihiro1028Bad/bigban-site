/**
 * グロース pull 型 API の例外整理(#177)。
 *
 * 目的: `} catch {}` で真因を握り潰して不透明な 5xx を返すのをやめる。
 * - 真因をredact・1,024文字制限してサーバログに出す(沈黙させない)。
 * - Notion の「プロパティが存在しない」エラーは設定不備なので、**どのプロパティを追加すべきか**を
 *   運用者に伝える(欠落を「謎の 5xx」にしない)。機密(トークン等)はレスポンスに出さない。
 *
 * 必要 Notion プロパティの存在確認は、別途スキーマ問い合わせ(pre-flight)ではなく
 * **実際の書き込みエラーから reactive に検出**する。余計な API 呼び出しを増やさず、
 * かつ「実際に落ちた原因」をそのまま運用者へ提示できる。
 */

import { diagnosticDetail } from "@/lib/growth/externalApiError";

export interface GrowthApiErrorResult {
  status: number;
  body: { success: false; error: string };
}

/**
 * Notion API の「プロパティが存在しない」系エラーからプロパティ名を抽出する。
 * 該当しなければ null。
 */
export function missingNotionProperty(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const patterns = [
    /([^\s"']+) is not a property that exists/i,
    /property ["']?([^"'\s]+)["']? does not exist/i,
  ];
  for (const re of patterns) {
    const match = message.match(re);
    if (match) return match[1];
  }
  return null;
}

/**
 * 例外を整理して `{ status, body }` を返す。
 * - 必ず真因をサーバログへ(`console.error`)。
 * - Notion プロパティ欠落 → 500 ＋「どのプロパティを追加すべきか」(設定不備として可視化)。
 * - それ以外 → `fallback` メッセージの 502(一時障害)。
 */
export function growthApiError(
  context: string,
  error: unknown,
  fallback: string
): GrowthApiErrorResult {
  // 真因を握り潰さず、機密除去と長さ制限を通した診断情報だけをログへ出す。
  const raw = error instanceof Error ? error.message : String(error);
  const detail = diagnosticDetail(raw, {
    secrets: [
      process.env.APPROVE_SECRET ?? "",
      process.env.APPROVE_SESSION_SECRET ?? "",
      process.env.MICROCMS_API_KEY ?? "",
      process.env.MICROCMS_MANAGEMENT_API_KEY ?? "",
      process.env.NOTION_TOKEN ?? "",
    ],
  });
  console.error(`[growth/${context}] ${fallback}: ${detail}`);

  const prop = missingNotionProperty(error);
  if (prop) {
    return {
      status: 500,
      body: {
        success: false,
        error: `Notion に必要なプロパティ「${prop}」がありません。記事ネタ案DBに追加してください。`,
      },
    };
  }
  return { status: 502, body: { success: false, error: fallback } };
}
