"use client";

interface LanguageToggleProps {
  isJa: boolean;
  onSwitch: (locale: "ja" | "en") => void;
}

// JP / EN 言語切替トグル（ヘッダー・モバイルメニューで共有）。
export default function LanguageToggle({ isJa, onSwitch }: LanguageToggleProps) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => onSwitch("ja")}
        aria-pressed={isJa}
        className={isJa ? "text-text-light cursor-default" : "text-text-gray hover:text-accent motion-safe:transition-colors cursor-pointer"}
      >
        JP
      </button>
      <span className="text-text-gray">/</span>
      <button
        onClick={() => onSwitch("en")}
        aria-pressed={!isJa}
        className={isJa ? "text-text-gray hover:text-accent motion-safe:transition-colors cursor-pointer" : "text-text-light cursor-default"}
      >
        EN
      </button>
    </div>
  );
}
