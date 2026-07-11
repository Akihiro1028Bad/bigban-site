/**
 * 本文画像 AI 再生成の依頼入力(スタイル・自由指示・文字指定)の純ロジック(#156/P2)。
 * 生成モーダル(BodyImageRegenModal)と ApproveClient が共有する。チップ定義と送信 body 組み立てのみを
 * 純関数化し、UI(モーダル)側は薄い presentation にする(テストは純ロジックに寄せる)。
 */
import type { RequestedBodyImageStyle } from "@/lib/growth/bodyImage";

/** 生成モーダルの依頼入力。style=auto は「おまかせ(Claude が文脈で選ぶ)」。 */
export interface BodyImageRegenInput {
  style: RequestedBodyImageStyle;
  /** 自由指示(最大500字・UI 側で制限)。 */
  instruction: string;
  /** 図に焼き込む文字・数値(最大1000字・UI 側で制限)。 */
  textSpec: string;
}

export type BodyImageRegenTarget =
  | { kind: "src"; targetSrc: string }
  | { kind: "placeholder"; placeholderId: string };

/** スタイル6択チップ(先頭=おまかせ)。日本語ラベルは承認画面表示用。 */
export const BODY_IMAGE_STYLE_CHIPS: readonly { key: RequestedBodyImageStyle; label: string }[] = [
  { key: "auto", label: "おまかせ" },
  { key: "mascot", label: "宇宙人マスコット" },
  { key: "illust", label: "雰囲気イラスト" },
  { key: "court", label: "コート図" },
  { key: "flow", label: "フロー図" },
  { key: "infographic", label: "インフォグラフィック" },
];

/** API(/api/growth/body-image/regen)へ送る body を組む。style は内部キー/auto の文字列で送る。 */
export function buildBodyRegenBody(
  pageId: string,
  target: BodyImageRegenTarget,
  input: BodyImageRegenInput
): Record<string, unknown> {
  return {
    pageId,
    ...(target.kind === "src"
      ? { targetSrc: target.targetSrc }
      : { placeholderId: target.placeholderId }),
    style: input.style,
    textSpec: input.textSpec,
    instruction: input.instruction,
  };
}
