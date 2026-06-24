/**
 * microCMS コンテンツ書き込み API(下書き作成・更新)を直接叩く。
 *
 * 下書きモードを headless(claude -p)でも動かすため、microCMS の MCP に依存せず
 * REST(`https://{serviceDomain}.microcms.io/api/v1/{endpoint}`)を使う。
 * fetch は注入可能(テスト容易性)。API キーは content の PUT/PATCH 権限が必要。
 *
 * 作成は **slug 由来の決定的 contentId で冪等化**する(#21): PUT で作成し、
 * 既存IDなら microCMS が 400「Content is already exists」を返すので PATCH で上書き。
 * これにより 504 等のリトライ・再実行でも**重複下書きを作らない**(レジューム可能)。
 */

import type { FetchFn, HttpResponse } from "./http";

/** リトライ・タイムアウトの設定(すべて任意・既定あり)。 */
export interface RetryConfig {
  /** 最大試行回数(初回含む) */
  maxAttempts: number;
  /** 初回バックオフ(ms) */
  baseDelayMs: number;
  /** バックオフ上限(ms) */
  maxDelayMs: number;
  /** 1リクエストのタイムアウト(ms, AbortController) */
  timeoutMs: number;
}

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  // microCMS の重い書き込み(category 参照 + 本文HTML)は 15 秒を超えることがあり、
  // 短いタイムアウトで自前 abort → リトライ嵐 → 冪等PUTの着地済みでも false-negative
  // になっていた(#58)。「短く何度もアボート」より「長く1回待つ」を採る。
  timeoutMs: 45000,
};

/** 正の整数なら返す。非数値 / 0 以下 / undefined は undefined。 */
function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * 環境変数からリトライ設定の上書き(部分)を解決する(#58)。
 * `GROWTH_MICROCMS_TIMEOUT_MS` / `GROWTH_MICROCMS_MAX_ATTEMPTS` を正の整数のみ採用。
 * 不正値・未設定は無視し、既定(DEFAULT_RETRY)に委ねる。
 */
export function resolveRetryConfig(
  env: Record<string, string | undefined>
): Partial<RetryConfig> {
  const out: Partial<RetryConfig> = {};
  const timeoutMs = parsePositiveInt(env.GROWTH_MICROCMS_TIMEOUT_MS);
  if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
  const maxAttempts = parsePositiveInt(env.GROWTH_MICROCMS_MAX_ATTEMPTS);
  if (maxAttempts !== undefined) out.maxAttempts = maxAttempts;
  return out;
}

export interface ContentApiOptions {
  serviceDomain: string;
  apiKey: string;
  fetchFn: FetchFn;
  /** 部分指定可。未指定は DEFAULT_RETRY。 */
  retry?: Partial<RetryConfig>;
  /** バックオフ待機(テストで注入)。未指定は setTimeout ベース。 */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt: number, cfg: RetryConfig): number {
  return Math.min(cfg.maxDelayMs, cfg.baseDelayMs * 2 ** (attempt - 1));
}

/**
 * 自前の AbortController が時間切れで打ち切ったことを表す(#58)。
 * 「microCMS 側の障害」ではなく「こちらのタイムアウト値」が原因であることを明示し、
 * 失敗通知の誤誘導(一律「外部障害」)を防ぐ。
 */
export class ContentTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`リクエストがタイムアウトしました (${timeoutMs}ms)`);
    this.name = "ContentTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** microCMS API の非 2xx 応答を表す。status / body を保持し、4xx/5xx の判別に使う。 */
export class MicrocmsHttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`microCMS コンテンツ API に失敗しました (HTTP ${status}): ${body}`);
    this.name = "MicrocmsHttpError";
    this.status = status;
    this.body = body;
  }
}

function contentUrl(
  serviceDomain: string,
  endpoint: string,
  contentId: string
): string {
  return `https://${serviceDomain}.microcms.io/api/v1/${endpoint}/${contentId}`;
}

/**
 * slug を microCMS の contentId 規則(英小文字・数字・ハイフン)に正規化する。
 * 同じ slug からは必ず同じ id を生成し、冪等な作成を可能にする。
 */
export function slugToContentId(slug: string): string {
  const id = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!id) {
    throw new Error(`slug から有効な contentId を生成できません: "${slug}"`);
  }
  return id;
}

/** 1リクエストを AbortController タイムアウト付きで送る。 */
async function requestOnce(
  method: "PUT" | "PATCH",
  url: string,
  apiKey: string,
  body: unknown,
  fetchFn: FetchFn,
  timeoutMs: number
): Promise<HttpResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetchFn(url, {
      method,
      headers: {
        "X-MICROCMS-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    // 自前のタイムアウトで打ち切った場合は、外部障害と区別できる型で投げ直す。
    if (timedOut) throw new ContentTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * microCMS へ書き込む。5xx / ネットワーク / タイムアウトは指数バックオフで再試行、
 * 4xx は即失敗(リトライしない)。冪等化(#21)と併用すれば再試行しても重複しない。
 */
async function send(
  method: "PUT" | "PATCH",
  url: string,
  body: unknown,
  options: ContentApiOptions
): Promise<string> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY, ...options.retry };
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    let res: HttpResponse;
    try {
      res = await requestOnce(
        method,
        url,
        options.apiKey,
        body,
        options.fetchFn,
        cfg.timeoutMs
      );
    } catch (error: unknown) {
      // ネットワーク / タイムアウト(abort) → 再試行対象
      lastError = error;
      if (attempt >= cfg.maxAttempts) throw error;
      await sleep(backoffMs(attempt, cfg));
      continue;
    }

    if (!res.ok) {
      const err = new MicrocmsHttpError(res.status, await res.text());
      if (res.status < 500) throw err; // 4xx は即失敗
      lastError = err;
      if (attempt >= cfg.maxAttempts) throw err;
      await sleep(backoffMs(attempt, cfg));
      continue;
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      throw new Error("microCMS 応答に id が含まれていません。");
    }
    return json.id;
  }

  /* istanbul ignore next -- @preserve ループは必ず return/throw で抜ける */
  throw lastError;
}

function isAlreadyExists(error: MicrocmsHttpError): boolean {
  return error.status === 400 && /already exists/i.test(error.body);
}

/**
 * 「PUT が着地したか不明」なエラーか(#58)。
 * タイムアウト / ネットワーク / 5xx は、冪等PUTが microCMS 側で完了している可能性が
 * あるため、PATCH 照合で実在確認する。4xx(送信内容拒否)は着地していないので対象外。
 */
function isLandingUncertain(error: unknown): boolean {
  if (error instanceof MicrocmsHttpError) return error.status >= 500;
  return true;
}

/**
 * 下書き(status=draft)を **slug 由来の決定的 ID** で冪等に作成する。
 * 同一slugの再実行では PUT が 400(already exists)になるため PATCH で上書きする。
 * data.slug(文字列)が必須。返すのは生成した contentId。
 */
export async function createDraft(
  endpoint: string,
  data: Record<string, unknown>,
  options: ContentApiOptions
): Promise<string> {
  const slug = data.slug;
  if (typeof slug !== "string" || slug.trim() === "") {
    throw new Error("冪等な作成には文字列の slug が必要です。");
  }
  const id = slugToContentId(slug);
  const url = `${contentUrl(options.serviceDomain, endpoint, id)}?status=draft`;

  try {
    return await send("PUT", url, data, options);
  } catch (error: unknown) {
    if (error instanceof MicrocmsHttpError && isAlreadyExists(error)) {
      // 既に同一IDの下書きが存在 = 前回の作成が成功済み。上書きしてレジューム。
      return send("PATCH", url, data, options);
    }
    if (isLandingUncertain(error)) {
      // タイムアウト/ネットワーク/5xx: 冪等PUTが着地済みかもしれない。
      // 決定的IDへ PATCH を試み、成功すれば「実在＝成功」として扱う(false-negative回避)。
      // 未作成なら PATCH は 404 になるため、元のエラー(根本原因)を投げ直す。
      // 照合は best-effort なので 1 回だけ(再試行でウォール時間を倍に膨らませない)。
      try {
        return await send("PATCH", url, data, {
          ...options,
          retry: { ...options.retry, maxAttempts: 1 },
        });
      } catch {
        throw error;
      }
    }
    throw error;
  }
}

/** 既存コンテンツの下書きを部分更新する(eyecatch 添付など)。 */
export function patchDraft(
  endpoint: string,
  contentId: string,
  data: Record<string, unknown>,
  options: ContentApiOptions
): Promise<string> {
  const url = `${contentUrl(
    options.serviceDomain,
    endpoint,
    contentId
  )}?status=draft`;
  return send("PATCH", url, data, options);
}

/**
 * 既存コンテンツを**公開**する(#167)。`?status=publish` で PATCH し、下書きを本番公開する。
 * 本文は変更せず状態だけ publish にする(空ボディ)。冪等(既に公開済みでも publish のまま)。
 * 公開は取り消しづらい外向き操作のため、呼び出し側で認証・検証(アイキャッチ/本文)を必ず行うこと。
 */
export function publishContent(
  endpoint: string,
  contentId: string,
  options: ContentApiOptions
): Promise<string> {
  const url = `${contentUrl(options.serviceDomain, endpoint, contentId)}?status=publish`;
  return send("PATCH", url, {}, options);
}
