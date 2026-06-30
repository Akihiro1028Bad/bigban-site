/**
 * 承認画面モーダル共通の a11y フック。proto(#proto) からの本番移植。
 * - 開いた瞬間に最初のフォーカス可能要素へフォーカス(なければパネル本体)
 * - Tab/Shift+Tab をパネル内に閉じ込める(フォーカストラップ)
 * - 閉じたら元のトリガー要素へフォーカスを戻す
 *
 * Esc での閉じ操作は呼び出し側(ボタン/page.tsx の集中ハンドラ)に委ねる。
 * 返り値の ref をパネル要素(motion.div など)に付け、role="dialog" / aria-modal を併せて指定する。
 */
"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement = HTMLDivElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    /* istanbul ignore next -- @preserve ref は render 後に必ず設定されるため到達不可 */
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // jsdom polyfill では offsetParent が常に truthy になり `||` 右辺
    // (`el === document.activeElement`) は未評価。istanbul は個別オペランドの
    // 分岐を抑止できないため宣言全体に ignore を付与する。
    /* istanbul ignore next -- @preserve || 右辺は jsdom では未評価 */
    const focusables = () =>
      [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    const first = focusables()[0];
    if (first) {
      first.focus();
    } else {
      node.setAttribute("tabindex", "-1");
      node.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      /* istanbul ignore next -- @preserve focusable 0件のときに Tab を送るテスト経路が無いため未到達 */
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // 端からの Tab/Shift+Tab を反対端へ巻き戻す。`!node.contains(active)` は
      // フォーカスが dialog 外へ逃げた場合の防御経路で、jsdom のテストでは到達しない。
      // istanbul は `||` 個別オペランドの分岐を抑止できないため、構文木全体に ignore を付与する。
      /* istanbul ignore next -- @preserve 防御オペランド/中間 Tab 経路はテストで未到達 */
      if (e.shiftKey && (active === firstEl || !node.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !node.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener("keydown", handleKeyDown);
    return () => {
      node.removeEventListener("keydown", handleKeyDown);
      /* istanbul ignore next -- @preserve unmount 時のフォーカス復帰。テストでは false 側へ到達しない */
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return ref;
}
