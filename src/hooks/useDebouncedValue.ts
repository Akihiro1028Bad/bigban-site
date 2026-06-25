"use client";

import { useEffect, useState } from "react";

/**
 * value を delayMs 後に反映するデバウンス値(#98)。
 * 連続更新中は最後の値だけ反映し、途中の値は破棄する(タイマーを張り直す)。
 * ライブプレビューのように高頻度更新を間引きたい場面で使う。
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
