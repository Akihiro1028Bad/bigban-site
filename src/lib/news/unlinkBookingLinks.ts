// 終了したイベントの本文から外す、予約先ドメイン(サブドメイン含む)。
const BOOKING_HOSTS = ["labola.jp", "tennisbear.net"] as const;

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
 * DOM 上で、予約先ドメイン宛ての <a> を外し、中身(テキスト・装飾)だけを残す。
 * 文字列の正規表現では属性値の中の `<a ...>` 風の文字列を誤認するため、
 * 必ずパース済みの DOM を対象にする(`a[href]` は data-href には当たらない)。
 * サイト内リンク・SNS・その他の外部リンクには触れない。
 */
export function unlinkBookingAnchors(root: ParentNode): void {
  for (const anchor of Array.from(root.querySelectorAll("a[href]"))) {
    if (!isBookingUrl(String(anchor.getAttribute("href")))) continue;
    anchor.replaceWith(...Array.from(anchor.childNodes));
  }
}
