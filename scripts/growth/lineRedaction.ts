/** LINE送信直前に機密文字列を除去する最終防御。 */

export interface LineRedactionOptions {
  secrets?: readonly string[];
  maxStringLength?: number;
}

const DEFAULT_MAX_STRING_LENGTH = 1_024;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeString(value: string, options: LineRedactionOptions): string {
  let sanitized = value;
  for (const secret of options.secrets ?? []) {
    if (secret) sanitized = sanitized.replace(new RegExp(escapeRegExp(secret), "g"), "[redacted]");
  }
  sanitized = sanitized
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/([?&]token=)[^&#\s"']*/gi, "$1[redacted]")
    .replace(
      /(\b[a-z0-9_-]*api[-_ ]?key\s*[:=]\s*)[^\s,"'}]+/gi,
      "$1[redacted]"
    )
    .replace(/(\(?HTTP\s+\d{3}\)?\s*:)[\s\S]*/gi, "$1 [redacted]");

  if (/<\/?[a-z][^>]*>/i.test(sanitized)) sanitized = "[redacted html]";

  const max = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  return sanitized.length > max ? `${sanitized.slice(0, Math.max(0, max - 1))}…` : sanitized;
}

export function sanitizeLinePayload<T>(payload: T, options: LineRedactionOptions = {}): T {
  if (typeof payload === "string") return sanitizeString(payload, options) as T;
  if (Array.isArray(payload)) {
    return payload.map((item: unknown) => sanitizeLinePayload(item, options)) as T;
  }
  if (payload !== null && typeof payload === "object") {
    const entries = Object.entries(payload).map(([key, value]) => [
      key,
      sanitizeLinePayload(value, options),
    ]);
    return Object.fromEntries(entries) as T;
  }
  return payload;
}
