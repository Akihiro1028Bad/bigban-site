/**
 * デバイスプレビュー(#proto 移植・本番忠実): 公開後の「読者の見え方」を本番の
 * 記事ページテーマそのままで確認する。
 *
 * 各端末の "真のビューポート幅" で DraftPreviewFrame(本番テーマ適用 iframe) を描画し、
 * ペインに収まるよう縮小表示する。これにより本番のビューポート基準レスポンシブが正確に
 * 再現される。proto は専用ルート + postMessage で高さを可変にしていたが、本番 frame は
 * 高さを返さないため、端末別の固定 frame height に縮約している(AD5-5)。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { DraftPreviewFrame } from "./DraftPreviewFrame";
import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from "./ui/icons";

interface DevicePreviewProps {
  html: string;
  slug: string;
}

type Device = "mobile" | "tablet" | "pc";

const DEVICES: {
  key: Device;
  label: string;
  vw: number;
  fh: number;
  icon: React.ReactNode;
}[] = [
  { key: "mobile", label: "スマホ", vw: 390, fh: 720, icon: <IconDeviceMobile size={14} /> },
  { key: "tablet", label: "タブレット", vw: 834, fh: 900, icon: <IconDeviceTablet size={14} /> },
  { key: "pc", label: "PC", vw: 1280, fh: 760, icon: <IconDeviceDesktop size={14} /> },
];

export function DevicePreview({ html, slug }: DevicePreviewProps) {
  const [device, setDevice] = useState<Device>("mobile");
  const [avail, setAvail] = useState(600);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 利用可能幅を測り、端末ビューポート幅をペインに収める縮小率を決める。
  useEffect(() => {
    const measure = () => {
      if (wrapRef.current) setAvail(wrapRef.current.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const current = DEVICES.find((d) => d.key === device) ?? DEVICES[2];
  const vw = current.vw;
  const fh = current.fh;
  const scale = Math.min(1, avail / vw);

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
                id={`device-preview-tab-${d.key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="device-preview-panel"
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

        <span className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
          公開後の見え方（{current.label} {vw}px
          {scale < 1 ? ` ・ ${Math.round(scale * 100)}%表示` : ""}）
        </span>
      </div>

      <div
        id="device-preview-panel"
        role="tabpanel"
        aria-labelledby={`device-preview-tab-${device}`}
        className="flex justify-center pb-2"
      >
        <div
          className="overflow-hidden rounded-[12px]"
          style={{
            width: Math.round(vw * scale),
            border: "1px solid var(--p-border-strong)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.4)",
          }}
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
              thepicklebangtheory.com/ja/news/{slug}
            </span>
          </div>

          {/* 真のビューポート幅で描画した frame を縮小して収める */}
          <div
            style={{
              width: Math.round(vw * scale),
              height: Math.round(fh * scale),
              overflow: "hidden",
              background: "#0a0a0a",
            }}
          >
            {/* DraftPreviewFrame に transform を直接渡せないため中間ラッパで縮小を表現 */}
            <div
              style={{
                width: vw,
                height: fh,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <DraftPreviewFrame
                key={`${slug}-${device}`}
                title="公開後プレビュー"
                html={html}
                className="block h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
