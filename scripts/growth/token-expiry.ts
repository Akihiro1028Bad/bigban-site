/**
 * Google OAuth リフレッシュトークンの失効間近を検知し、LINE 本文へ添える
 * 警告行を組み立てる純関数。
 *
 * リフレッシュトークンの失効日時は Google の API からは取得できない
 * (とくに OAuth 同意画面が「テスト」だと付与から 7 日で失効する)。
 * そのため運用者が発行時に失効予定時刻を `GROWTH_GOOGLE_TOKEN_EXPIRES_AT`
 * (ISO 文字列か epoch ミリ秒)として設定し、その値をもとに警告する。
 * 設定が無い(本番公開で実質無期限など)場合は警告を出さない。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_THRESHOLD_DAYS = 30;

/** `GROWTH_GOOGLE_TOKEN_EXPIRES_AT` の値を epoch ミリ秒に正規化する。不正/未設定は null。 */
export function parseExpiresAt(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export interface TokenExpiryInput {
  /** 失効予定の epoch ミリ秒。不明なら null(警告しない)。 */
  expiresAt: number | null;
  /** 判定基準時刻(epoch ミリ秒)。 */
  now: number;
  /** 何日前から警告するか(既定 30)。 */
  thresholdDays?: number;
}

/** 失効が近い/失効済みのときに警告行を返す。余裕があれば null。 */
export function buildTokenExpiryWarning(input: TokenExpiryInput): string | null {
  if (input.expiresAt === null) return null;

  const thresholdDays = input.thresholdDays ?? DEFAULT_THRESHOLD_DAYS;
  const remainingMs = input.expiresAt - input.now;

  if (remainingMs < 0) {
    return "⚠ Google 連携トークンが失効しました。再取得してください(手順: docs/operations/growth-windows-setup.md)。";
  }

  if (remainingMs > thresholdDays * MS_PER_DAY) return null;

  const remainingDays = Math.floor(remainingMs / MS_PER_DAY);
  return `⚠ Google 連携トークンの失効まで残り ${remainingDays}日です。早めに再取得してください(手順: docs/operations/growth-windows-setup.md)。`;
}
