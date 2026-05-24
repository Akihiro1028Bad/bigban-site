"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-deep-black flex flex-col items-center justify-center gap-6 text-text-light">
      <p className="text-sm tracking-wide">ページを表示できませんでした。</p>
      <button
        onClick={reset}
        className="bg-accent text-deep-black px-6 py-3 text-xs font-bold uppercase tracking-widest"
      >
        再読み込み
      </button>
    </div>
  );
}
