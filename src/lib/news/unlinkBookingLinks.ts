// 終了したイベントの本文から外す、予約先ドメイン(サブドメイン含む)。
const BOOKING_HOSTS = ["labola.jp", "tennisbear.net"] as const;

// サニタイズ済み HTML を対象にする。属性値に `>` が入らない前提
// (DOMPurify のシリアライズで `&gt;` になる)。
const ANCHOR_RE = /<a\s([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF_RE = /\bhref="([^"]*)"/i;

export function isBookingUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return BOOKING_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

/**
 * 予約先ドメイン宛ての <a> タグを外し、中身(テキスト・装飾)だけを残す。
 * サイト内リンク・SNS・その他の外部リンクには触れない。
 */
export function unlinkBookingLinks(html: string): string {
  return html.replace(ANCHOR_RE, (whole, attrs: string, inner: string) => {
    const href = HREF_RE.exec(attrs)?.[1];
    return href && isBookingUrl(href) ? inner : whole;
  });
}
