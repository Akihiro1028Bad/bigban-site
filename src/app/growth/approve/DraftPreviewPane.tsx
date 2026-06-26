/**
 * 下書きの本番プレビュー枠(#H7 分解 / #124・#129)。PC/モバイル幅トグル＋ブラウザ風chrome＋iframe。
 */

"use client";

import { DraftPreviewFrame } from "./DraftPreviewFrame";
import { PREVIEW_DEVICES, previewDeviceLabel, previewWidthClass, type PreviewDevice } from "./previewDevice";

// #100/#124: iframe 自体は枠なし・暗背景のみ(外側のchromeカードが枠/角丸を担う)。
const PREVIEW_FRAME_CLASS = "block h-96 w-full bg-[#0A0A0A]";

interface DraftPreviewPaneProps {
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  html: string;
}

export function DraftPreviewPane({ device, onDeviceChange, html }: DraftPreviewPaneProps) {
  return (
    <>
      <div role="group" aria-label="プレビュー幅" className="mb-2 inline-flex rounded-md border border-gray-300 p-0.5 text-xs">
        {PREVIEW_DEVICES.map((d) => {
          const selected = device === d;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={selected}
              onClick={() => onDeviceChange(d)}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                selected ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {previewDeviceLabel(d)}
            </button>
          );
        })}
      </div>
      <div className={`overflow-hidden rounded-md border border-gray-800 ${previewWidthClass(device)}`}>
        <div className="flex items-center gap-1.5 bg-gray-900 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-600" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-600" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-600" aria-hidden="true" />
          <span className="ml-2 truncate text-[10px] text-gray-400">thepicklebang.com / news</span>
        </div>
        <DraftPreviewFrame title="本番プレビュー" html={html} className={PREVIEW_FRAME_CLASS} />
      </div>
    </>
  );
}
