"use client";

import { useEffect, useRef, useState } from "react";

import { filterByQuery } from "./boardPrefs";

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
}

interface CommandPaletteProps {
  items: CommandItem[];
  /** 選択した item へジャンプ(詳細を開く)。 */
  onJump: (id: string) => void;
  /** 閉じる(Esc / 背景 / ジャンプ後)。 */
  onClose: () => void;
}

/**
 * コマンドパレット(#109)。⌘K / `/` で開き、タイトル検索→アイテムへジャンプする。
 *
 * dialog/フォーカストラップ/Esc への薄い DOM 結線のためカバレッジ対象外
 * (vitest.config.ts)。絞り込みの純ロジックは boardPrefs.ts でテスト済み。
 */
export function CommandPalette({ items, onJump, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const results = filterByQuery(items, query);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input, button:not([disabled])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-24">
      <button
        type="button"
        aria-label="コマンドパレットを閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="コマンドパレット"
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl"
      >
        <input
          ref={inputRef}
          type="text"
          aria-label="コマンド検索"
          placeholder="記事/施策を検索してジャンプ…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full border-b border-gray-200 px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-72 overflow-y-auto">
          {results.length > 0 ? (
            results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onJump(item.id)}
                  className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-900">{item.title}</span>
                  <span className="text-xs text-gray-500">{item.subtitle}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-gray-500">一致する項目がありません。</li>
          )}
        </ul>
      </div>
    </div>
  );
}
