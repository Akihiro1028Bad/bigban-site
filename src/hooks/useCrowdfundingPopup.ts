"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { isJunePromoActive } from "@/lib/promoSchedule";

const SESSION_KEY = "bigban-crowdfunding-dismissed";
const TRIGGER_SECTION_ID = "services";

/* istanbul ignore next -- SSR-only snapshot */
const noop = () => () => {};

export function useCrowdfundingPopup() {
  const isMounted = useSyncExternalStore(
    noop,
    () => true,
    /* istanbul ignore next -- SSR-only snapshot */
    () => false,
  );

  const [isNotDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) !== "true";
    } catch {
      return true;
    }
  });

  const [isTriggered, setIsTriggered] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const hasTriggered = useRef(false);

  // SERVICES セクションに到達 (画面に入った) 瞬間にポップアップを表示する。
  // 早すぎるとファーストビューを邪魔するので、ユーザーが Concept/Facility を読み終えて
  // SERVICES に到達する=ある程度エンゲージしたタイミングで出す設計。
  // sessionStorage で「閉じた」フラグが立っていれば observer を仕掛けない。
  // クラファン終了後 (JST 6/1 以降) はポップアップ自体を表示しない。
  useEffect(() => {
    if (!isMounted || !isNotDismissed || hasTriggered.current || isJunePromoActive())
      return;

    const target = document.getElementById(TRIGGER_SECTION_ID);
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasTriggered.current === false) {
          hasTriggered.current = true;
          setIsTriggered(true);
          observer.disconnect();
        }
      },
      { threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isMounted, isNotDismissed]);

  const isOpen = isMounted && isTriggered && !isDismissed;

  const closePopup = useCallback(() => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "true");
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  return { isOpen, closePopup };
}
