/**
 * アプリ(承認ページ API)から Notion を読み書きするための再エクスポート。
 *
 * 実装は scripts/growth 側に集約し(headless/通知と共有)、ここでは
 * `@/lib/growth/notion` で import できるよう薄く束ねるだけにする。
 */

export * from "../../../scripts/growth/notion";
export { defaultFetch } from "../../../scripts/growth/http";
export type { FetchFn, HttpResponse } from "../../../scripts/growth/http";
