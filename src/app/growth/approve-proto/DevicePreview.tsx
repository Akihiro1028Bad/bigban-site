/**
 * デバイスプレビュー(#proto・preview confidence): 公開後の「読者の見え方」を
 * スマホ / タブレット / PC 幅で確認する。承認前の確信を高めるのが目的。
 */
"use client";

import { useState } from "react";

import {
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconExternalLink,
} from "./icons";
import type { Article } from "./types";

type Device = "mobile" | "tablet" | "pc";

const DEVICES: { key: Device; label: string; width: number | null; icon: React.ReactNode }[] = [
  { key: "mobile", label: "スマホ", width: 390, icon: <IconDeviceMobile size={14} /> },
  { key: "tablet", label: "タブレット", width: 700, icon: <IconDeviceTablet size={14} /> },
  { key: "pc", label: "PC", width: null, icon: <IconDeviceDesktop size={14} /> },
];

function HeroBanner({ article, compact }: { article: Article; compact: boolean }) {
  const h = compact ? 150 : 210;
  if (!article.hasEyecatch) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          height: h,
          background: "var(--p-bg-active)",
          borderBottom: "1px dashed var(--p-border-strong)",
          color: "var(--p-text-3)",
          fontSize: 12.5,
        }}
      >
        アイキャッチ未設定
      </div>
    );
  }
  if (article.eyecatchUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data-URI/objectURL のモック画像
      <img
        src={article.eyecatchUrl}
        alt=""
        style={{ display: "block", width: "100%", height: h, objectFit: "cover", borderBottom: "1px solid var(--p-border)" }}
      />
    );
  }
  return (
    <div
      style={{
        position: "relative",
        height: h,
        background: `linear-gradient(135deg, hsl(${article.hue} 60% 30%), hsl(${
          (article.hue + 45) % 360
        } 55% 18%))`,
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 72% 22%, hsl(${
            (article.hue + 20) % 360
          } 70% 55% / 0.5), transparent 60%)`,
        }}
      />
    </div>
  );
}

function RenderedArticle({ article, compact }: { article: Article; compact: boolean }) {
  return (
    <div style={{ background: "var(--p-bg-elevated)" }}>
      <HeroBanner article={article} compact={compact} />
      <div style={{ padding: compact ? "18px 18px 26px" : "26px 30px 36px" }}>
        <span
          className="inline-block rounded-full px-2.5 py-[3px] text-[11px] font-medium"
          style={{ background: "var(--p-accent-weak)", color: "var(--p-accent)" }}
        >
          お知らせ
        </span>
        <h1
          className="mt-3 font-semibold tracking-tight"
          style={{ fontSize: compact ? 20 : 26, lineHeight: 1.35 }}
        >
          {article.title}
        </h1>
        <div
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]"
          style={{ color: "var(--p-text-3)", borderBottom: "1px solid var(--p-border)", paddingBottom: 14 }}
        >
          <span>2026.04.18</span>
          <span>·</span>
          <span>約{article.readMinutes || 4}分</span>
          <span>·</span>
          <span>{article.wordCount > 0 ? `${article.wordCount.toLocaleString()}字` : "—"}</span>
        </div>
        {/* mockData.ts の静的HTMLのみ。本番は microCMS 由来をサニタイズして渡す。 */}
        <div
          className="proto-article mt-5"
          dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
        />
      </div>
    </div>
  );
}

export function DevicePreview({ article }: { article: Article }) {
  const [device, setDevice] = useState<Device>("mobile");
  const current = DEVICES.find((d) => d.key === device) ?? DEVICES[2];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-[2px] rounded-[9px] p-[3px]"
          style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}
          role="tablist"
          aria-label="プレビュー端末"
        >
          {DEVICES.map((d) => {
            const active = d.key === device;
            return (
              <button
                key={d.key}
                role="tab"
                aria-selected={active}
                onClick={() => setDevice(d.key)}
                className="flex items-center gap-1.5 rounded-[7px] px-2.5 py-[5px] text-[12px] font-medium transition-colors"
                style={{
                  background: active ? "var(--p-bg-raised)" : "transparent",
                  color: active ? "var(--p-text)" : "var(--p-text-3)",
                }}
              >
                {d.icon}
                {d.label}
              </button>
            );
          })}
        </div>

        <div
          className="ml-auto flex min-w-0 items-center gap-1.5 rounded-[8px] px-2.5 py-[5px] text-[11.5px]"
          style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text-3)" }}
          title="公開後URL(プレビュー)"
        >
          <span className="truncate" style={{ fontFamily: "var(--p-mono)" }}>
            thepicklebangtheory.com/ja/news/{article.id}
          </span>
          <IconExternalLink size={12} />
        </div>
      </div>

      <div className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
        公開後の見え方（{current.label}{current.width ? ` ${current.width}px` : ""}）
      </div>

      <div className="flex justify-center pb-2">
        {device === "pc" ? (
          <div
            className="w-full max-w-[760px] overflow-hidden rounded-[12px]"
            style={{ border: "1px solid var(--p-border-strong)", boxShadow: "0 18px 50px rgba(0,0,0,0.4)" }}
          >
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ background: "var(--p-bg-raised)", borderBottom: "1px solid var(--p-border)" }}
            >
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#f87171" }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#f9b94e" }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#3ddc97" }} />
              <span
                className="ml-2 flex-1 truncate rounded-[6px] px-2.5 py-[3px] text-[11px]"
                style={{ background: "var(--p-bg-input)", color: "var(--p-text-3)", fontFamily: "var(--p-mono)" }}
              >
                thepicklebangtheory.com/ja/news/{article.id}
              </span>
            </div>
            <RenderedArticle article={article} compact={false} />
          </div>
        ) : (
          <div
            className="overflow-hidden"
            style={{
              width: current.width ?? 390,
              maxWidth: "100%",
              borderRadius: device === "mobile" ? 30 : 18,
              padding: device === "mobile" ? 8 : 10,
              background: "var(--p-bg-active)",
              border: "1px solid var(--p-border-strong)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
            }}
          >
            {device === "mobile" && (
              <div className="flex justify-center pb-2 pt-1">
                <span style={{ width: 52, height: 5, borderRadius: 3, background: "var(--p-border-strong)" }} />
              </div>
            )}
            <div
              className="overflow-hidden"
              style={{ borderRadius: device === "mobile" ? 22 : 10, border: "1px solid var(--p-border)" }}
            >
              <RenderedArticle article={article} compact />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
