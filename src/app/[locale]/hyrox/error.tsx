"use client";

import { useLocale } from "next-intl";

export default function Error({ reset }: { reset: () => void }) {
  const isJa = useLocale() === "ja";
  const message = isJa
    ? "ページを表示できませんでした。"
    : "Something went wrong.";
  const retryLabel = isJa ? "再読み込み" : "Reload";

  return (
    <div className="min-h-screen bg-deep-black flex flex-col items-center justify-center gap-6 text-text-light">
      <p className="text-sm tracking-wide">{message}</p>
      <button
        onClick={reset}
        className="bg-accent text-deep-black px-6 py-3 text-xs font-bold uppercase tracking-widest"
      >
        {retryLabel}
      </button>
    </div>
  );
}
