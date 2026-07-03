/**
 * 全 pull 型ループの wedge 検知レジストリ(#220-4・レビュー MEDIUM-2 対応)。純ロジック。
 *
 * pull 型ループ(構成案修正/アドバイス/装飾/アイキャッチ再生成/本文画像再生成/
 * アドバイス反映/本文コメント)はいずれも「○○ステータス」(select)＋「○○依頼時刻」(date)
 * の同型ペアで進行を表す。busy(依頼中/処理中)なのに依頼時刻が無い行は時間で reap できず
 * 無期限 wedge するため、ここに status/requestedAt のプロパティ名ペアを一覧化し、
 * stall-check が横断的に {@link selectWedgeJobIds} を適用できるようにする。
 *
 * プロパティ名は各ループの正典(*_PROPS)から参照する(重複定義しない=名前変更に追随)。
 * 新しい pull 型ループを追加したら必ずここにも登録する(wedgeLoops.test.ts が件数を守る)。
 */

import { ADVISE_PROPS } from "./advise";
import { ADVISE_APPLY_PROPS } from "./advise-apply";
import { BODY_REGEN_PROPS } from "./body-image-regen";
import { BODY_COMMENT_PROPS } from "./bodyComment";
import { DECORATE_PROPS } from "./decorate";
import { REGEN_PROPS } from "./eyecatch-regen";
import { REVISE_PROPS } from "./revise";

/** wedge 検知対象ループ1件(表示ラベルと Notion プロパティ名ペア)。 */
export interface WedgeLoop {
  /** 通知に載せる日本語ラベル。 */
  label: string;
  /** ステータス(select)のプロパティ名。busy 判定(依頼中/処理中)は staleJob.ts と共通。 */
  statusProp: string;
  /** 依頼時刻(date)のプロパティ名。null なら時間 reap 不能=wedge。 */
  requestedAtProp: string;
}

/** 全 pull 型ループ。stall-check はこれを回して wedge を横断検知する。 */
export const WEDGE_LOOPS: readonly WedgeLoop[] = [
  { label: "構成案修正", statusProp: REVISE_PROPS.status, requestedAtProp: REVISE_PROPS.requestedAt },
  { label: "アドバイス", statusProp: ADVISE_PROPS.status, requestedAtProp: ADVISE_PROPS.requestedAt },
  { label: "装飾", statusProp: DECORATE_PROPS.status, requestedAtProp: DECORATE_PROPS.requestedAt },
  {
    label: "アイキャッチ再生成",
    statusProp: REGEN_PROPS.status,
    requestedAtProp: REGEN_PROPS.requestedAt,
  },
  {
    label: "本文画像再生成",
    statusProp: BODY_REGEN_PROPS.status,
    requestedAtProp: BODY_REGEN_PROPS.requestedAt,
  },
  {
    label: "アドバイス反映",
    statusProp: ADVISE_APPLY_PROPS.status,
    requestedAtProp: ADVISE_APPLY_PROPS.requestedAt,
  },
  {
    label: "本文コメント",
    statusProp: BODY_COMMENT_PROPS.status,
    requestedAtProp: BODY_COMMENT_PROPS.requestedAt,
  },
];

/** wedge 通知に載せる「タイトル（ループ名）」。タイトル空は (無題)。 */
export function formatWedgeTitle(title: string, label: string): string {
  return `${title.trim() || "(無題)"}（${label}）`;
}
