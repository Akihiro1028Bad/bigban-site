/**
 * アプリ(承認ページ API)から microCMS 下書きを書き込むための再エクスポート。
 *
 * 実装は scripts/growth 側に集約し(headless 投入と共有)、ここでは
 * `@/lib/growth/content` で import できるよう薄く束ねるだけにする。
 */

export { patchDraft, publishContent } from "../../../scripts/growth/content";
export type { ContentApiOptions } from "../../../scripts/growth/content";
