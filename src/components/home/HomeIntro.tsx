"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { StarfieldWarpIntro } from "@/components/intro/StarfieldWarpIntro";

import type { AnimationPhase } from "@/components/teaser/types";
import type { ReactNode } from "react";
import { EASE } from "@/constants/motion";

const SESSION_KEY = "bigban-intro-played";
// ロゴ表示時間 (入場 0.5s + hold 0.3s 相当)。content 受信から unmount までの遅延。
const LOGO_HOLD_MS = 800;
// フェイルセーフ: phase=content が永遠に来ないケースに備え、
// マウントから一定時間で必ず unmount する。canvas total ~3.8s + 余裕で 6 秒。
const FALLBACK_UNMOUNT_MS = 6000;

interface HomeIntroProps {
  children: ReactNode;
}

/* istanbul ignore next -- SSR-only snapshot */
const noop = () => () => {};

export default function HomeIntro({ children }: HomeIntroProps) {
  const isMounted = useSyncExternalStore(
    noop,
    () => true,
    /* istanbul ignore next -- SSR-only snapshot */
    () => false
  );
  const [shouldShowIntro] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) !== "true";
    } catch {
      return false;
    }
  });
  const [phase, setPhase] = useState<AnimationPhase>("dark");
  const [isIntroComplete, setIsIntroComplete] = useState(!shouldShowIntro);
  // ロゴ hold 用 setTimeout の id 管理。unmount 時に確実に clearTimeout する
  // (LOGO_HOLD_MS=800ms 以内のナビゲーション等で setIsIntroComplete が
  // unmount 後に呼ばれるのを防ぐ)。
  const logoHoldTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove("intro-pending");
  }, []);

  // unmount 時に hold timer を必ず cleanup
  useEffect(() => {
    return () => {
      if (logoHoldTimerRef.current !== null) {
        window.clearTimeout(logoHoldTimerRef.current);
        logoHoldTimerRef.current = null;
      }
    };
  }, []);

  const handlePhaseChange = useCallback((newPhase: AnimationPhase) => {
    setPhase(newPhase);
    if (newPhase === "content") {
      try {
        sessionStorage.setItem(SESSION_KEY, "true");
      } catch {
        // sessionStorage unavailable
      }
      // 既に hold timer が走っていれば上書き前にクリア (二重発火防止)
      if (logoHoldTimerRef.current !== null) {
        window.clearTimeout(logoHoldTimerRef.current);
      }
      logoHoldTimerRef.current = window.setTimeout(() => {
        setIsIntroComplete(true);
        logoHoldTimerRef.current = null;
      }, LOGO_HOLD_MS);
    }
  }, []);

  // フェイルセーフ: 何があっても必ず FALLBACK_UNMOUNT_MS で intro を畳む。
  // - StarfieldWarpIntro の rAF が止まるなど phase=content が来ない場合
  // - Framer Motion AnimatePresence の race で exit が発火しない場合
  useEffect(() => {
    if (!shouldShowIntro) return;
    const id = window.setTimeout(() => {
      setIsIntroComplete(true);
    }, FALLBACK_UNMOUNT_MS);
    return () => window.clearTimeout(id);
  }, [shouldShowIntro]);

  if (!isMounted || !shouldShowIntro) {
    return <>{children}</>;
  }

  return (
    <>
      {/* 黒背景: isIntroComplete まで表示。fade-out で抜ける。 */}
      <AnimatePresence>
        {!isIntroComplete && (
          <motion.div
            key="intro-bg"
            className="fixed inset-0 z-[100] bg-black pointer-events-none"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        )}
      </AnimatePresence>

      {/* canvas (StarfieldWarp): phase=content の瞬間に即時 unmount。
          これにより rAF 停止後の最後のフレーム (黒) が残らない。 */}
      {!isIntroComplete && phase !== "content" && (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          <StarfieldWarpIntro onPhaseChange={handlePhaseChange} />
        </div>
      )}

      {/* ロゴ: phase=content から isIntroComplete まで独立レイヤーで表示。
          自身も bg-black を持ち、黒背景の exit と同時に exit しても背景の黒が引き継がれる。 */}
      <AnimatePresence>
        {phase === "content" && !isIntroComplete && (
          <motion.div
            key="intro-logo"
            className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none bg-black"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <Image
              src="/logos/yoko-neon.png"
              alt="THE PICKLE BANG THEORY"
              width={360}
              height={80}
              priority
            />
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </>
  );
}
