/**
 * house style ライブプレビュー(#proto P3b・本番移植・画像指示再設計)。
 *
 * 実画像生成はしない。mediaSvgUrl("mascot") を背景に敷き、コスミックなグローと
 * action 字幕を重ねて「宇宙人マスコット×コスミックで、宇宙人が〈action〉している」絵の "見え方" を表現する。
 * 実生成は固定マスコット(ポーズ可変なし)のため、可変分は字幕でのみ反映し「生成イメージ(参考)」と明示する。
 *
 * proto は framer-motion で字幕をフェードインしていたが、本番 P3b は framer-motion 不使用のため
 * 字幕は静的描画に置き換える(見え方の情報量は同じ)。
 */
"use client";

import { mediaSvgUrl } from "./mediaLibrary";

interface HouseStylePreviewProps {
  hue: number;
  action: string;
  isEyecatch?: boolean;
}

export function HouseStylePreview({ hue, action, isEyecatch }: HouseStylePreviewProps) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-[10px]"
      style={{ border: "1px solid var(--p-border-strong)", aspectRatio: isEyecatch ? "16 / 9" : "4 / 3" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data-URI のモック画像。本番の実アイキャッチは ImagesView の EyecatchThumb(next/image)。 */}
      <img
        src={mediaSvgUrl("mascot", hue)}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* コスミックなグロー(house styleの世界観) */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(130% 90% at 72% 18%, rgba(48,110,195,0.4), transparent 62%)" }}
      />

      <span
        className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-[1px] text-[9.5px] font-medium"
        style={{ background: "rgba(0,0,0,0.5)", color: "var(--p-accent)" }}
      >
        宇宙人 × コスミック
      </span>
      <span
        className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-[1px] text-[9.5px]"
        style={{ background: "rgba(0,0,0,0.5)", color: "var(--p-text-2)" }}
      >
        生成イメージ(参考)
      </span>

      {isEyecatch && (
        <span
          className="absolute left-1.5 bottom-9 rounded-[5px] px-1.5 py-[1px] text-[9.5px] font-semibold"
          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
        >
          アイキャッチ
        </span>
      )}

      <div
        className="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-5"
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}
      >
        <div className="text-[12px] font-medium leading-snug" style={{ color: "#fff" }}>
          <span style={{ color: "var(--p-accent)" }}>宇宙人</span>
          {action ? `が${action}` : "の動きはおまかせ"}
        </div>
      </div>
    </div>
  );
}
