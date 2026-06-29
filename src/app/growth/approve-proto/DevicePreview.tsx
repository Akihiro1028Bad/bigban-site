/**
 * デバイスプレビュー(#proto・本番忠実): 公開後の「読者の見え方」を本番の記事ページそのままで確認する。
 *
 * 専用ルート approve-proto/preview/[id] を iframe で各端末の "真のビューポート幅" で読み込み、
 * ペインに収まるよう縮小表示する。これにより本番のビューポート基準レスポンシブ(lg: 等)が正確に再現される。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from "./icons";
import type { Article } from "./types";

type Device = "mobile" | "tablet" | "pc";

const DEVICES: { key: Device; label: string; vw: number; icon: React.ReactNode }[] = [
  { key: "mobile", label: "スマホ", vw: 390, icon: <IconDeviceMobile size={14} /> },
  { key: "tablet", label: "タブレット", vw: 834, icon: <IconDeviceTablet size={14} /> },
  { key: "pc", label: "PC", vw: 1280, icon: <IconDeviceDesktop size={14} /> },
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function DevicePreview({ article }: { article: Article }) {
  const [device, setDevice] = useState<Device>("mobile");
  const [contentHeight, setContentHeight] = useState(560);
  const [avail, setAvail] = useState(600);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 利用可能幅を測り、端末ビューポート幅をペインに収める縮小率を決める。
  useEffect(() => {
    const measure = () => { if (wrapRef.current) setAvail(wrapRef.current.clientWidth); };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // iframe(プレビュールート)から実コンテンツ高さを受け取り、iframe を内容に合わせる。
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; id?: string; height?: number };
      if (d?.type === "proto-preview-height" && d.id === article.id && typeof d.height === "number") {
        setContentHeight(clamp(d.height, 360, 4000));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [article.id, device]);

  const current = DEVICES.find((d) => d.key === device) ?? DEVICES[2];
  const vw = current.vw;
  const scale = Math.min(1, avail / vw);
  const src = `/growth/approve-proto/preview/${article.id}`;

  return (
    <div className="flex flex-col gap-4" ref={wrapRef}>
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
                style={{ background: active ? "var(--p-bg-raised)" : "transparent", color: active ? "var(--p-text)" : "var(--p-text-3)" }}
              >
                {d.icon}
                {d.label}
              </button>
            );
          })}
        </div>

        <span className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
          公開後の見え方（{current.label} {vw}px{scale < 1 ? ` ・ ${Math.round(scale * 100)}%表示` : ""}）
        </span>
      </div>

      <div className="flex justify-center pb-2">
        <div
          className="overflow-hidden rounded-[12px]"
          style={{ width: Math.round(vw * scale), border: "1px solid var(--p-border-strong)", boxShadow: "0 18px 50px rgba(0,0,0,0.4)" }}
        >
          {/* ブラウザバー(本番URL表示) */}
          <div
            className="flex items-center gap-2 px-3"
            style={{ height: 30, background: "var(--p-bg-raised)", borderBottom: "1px solid var(--p-border)" }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f9b94e" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3ddc97" }} />
            <span
              className="ml-2 flex-1 truncate rounded-[6px] px-2.5 py-[3px] text-[11px]"
              style={{ background: "var(--p-bg-input)", color: "var(--p-text-3)", fontFamily: "var(--p-mono)" }}
            >
              thepicklebangtheory.com/ja/news/{article.id}
            </span>
          </div>

          {/* 真のビューポート幅で描画した iframe を縮小して収める */}
          <div style={{ width: Math.round(vw * scale), height: Math.round(contentHeight * scale), overflow: "hidden", background: "#0a0a0a" }}>
            <iframe
              key={`${article.id}-${device}`}
              src={src}
              title="公開後プレビュー"
              style={{
                width: vw,
                height: contentHeight,
                border: 0,
                display: "block",
                background: "#0a0a0a",
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
