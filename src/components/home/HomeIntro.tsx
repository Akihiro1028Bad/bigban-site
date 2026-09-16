"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

import { EASE } from "@/constants/motion";

import type { ReactNode } from "react";

const SESSION_KEY = "bigban-intro-played";
/** ハイドレーション前に main を隠す html クラス (introScript が付与する) */
const PENDING_CLASS = "intro-pending";
/** マウント後にイントロ中のスクロールを固定する html クラス */
const SCROLL_LOCK_CLASS = "intro-scroll-lock";
// ロゴ表示時間 (入場 0.5s + hold 0.3s 相当)。マウントから unmount までの遅延。
// ここから退場フェード 0.5s がかかるので、演出全体は約 1.3 秒。
const LOGO_HOLD_MS = 800;
// フェイルセーフ: このタイマーがするのは setIsIntroComplete(true) だけで、
// それは LOGO_HOLD_MS の hold timer が既に済ませている。備えられるのは
// hold 用 setTimeout 自体が何らかの理由で発火しないケースのみ (exit が
// 止まった場合はこのタイマーが発火してもオーバーレイは畳まれない)。
// ロゴのみの構成では hold timer と役割がほぼ重なるが、
// 2026-09-16 オーナー判断で残置を決定。演出 1.3s に対し余裕を持たせた 3 秒。
const FALLBACK_UNMOUNT_MS = 3000;

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
  // イントロを出すかはマウント時に一度だけ決める。
  // reduced-motion の判定は以前 StarfieldWarpIntro が持っていたが、
  // canvas を外したのでここへ移した。
  const [shouldShowIntro] = useState(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return false;
      }
      return sessionStorage.getItem(SESSION_KEY) !== "true";
    } catch {
      return false;
    }
  });
  const [isIntroComplete, setIsIntroComplete] = useState(!shouldShowIntro);
  // hold 用 setTimeout の id。unmount 時に確実に clearTimeout し、
  // 800ms 以内の離脱で unmount 後に setState が呼ばれるのを防ぐ。
  const logoHoldTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove(PENDING_CLASS);
  }, []);

  // イントロ再生中はスクロールを固定する。
  // ハイドレーション前は intro-pending が担い、マウント後はこのクラスが
  // isIntroComplete まで引き継ぐ。両者は同一コミットで入れ替わるため、
  // ロックが途切れる瞬間はない。
  useEffect(() => {
    const root = document.documentElement;
    if (!shouldShowIntro || isIntroComplete) {
      root.classList.remove(SCROLL_LOCK_CLASS);
      return;
    }
    root.classList.add(SCROLL_LOCK_CLASS);
    return () => {
      root.classList.remove(SCROLL_LOCK_CLASS);
    };
  }, [shouldShowIntro, isIntroComplete]);

  // ロゴを出したことを記録し、LOGO_HOLD_MS 後に畳む。
  // 記録は shouldShowIntro が true のときだけ: false のときに書くと、
  // セッション途中で reduced-motion を解除したユーザーにイントロが出なくなる。
  useEffect(() => {
    if (!shouldShowIntro) return;
    try {
      sessionStorage.setItem(SESSION_KEY, "true");
    } catch {
      // sessionStorage unavailable
    }
    logoHoldTimerRef.current = window.setTimeout(() => {
      setIsIntroComplete(true);
      logoHoldTimerRef.current = null;
    }, LOGO_HOLD_MS);
    return () => {
      if (logoHoldTimerRef.current !== null) {
        window.clearTimeout(logoHoldTimerRef.current);
        logoHoldTimerRef.current = null;
      }
    };
  }, [shouldShowIntro]);

  // フェイルセーフ: 何があっても FALLBACK_UNMOUNT_MS で intro を畳む。
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

      {/* ロゴ: マウントから isIntroComplete まで。自身も bg-black を持ち、
          黒背景の exit と同時に exit しても背景の黒が引き継がれる。 */}
      <AnimatePresence>
        {!isIntroComplete && (
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
