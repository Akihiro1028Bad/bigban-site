"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { BigBangCanvas } from "@/components/teaser/BigBangCanvas";
import { TeaserContent } from "@/components/teaser/TeaserContent";
import { IntroEngineA } from "@/components/home/intro-spikes/IntroEngineA";
import { IntroEngineB } from "@/components/home/intro-spikes/IntroEngineB";
import { IntroEngineC } from "@/components/home/intro-spikes/IntroEngineC";
import { IntroEngineD } from "@/components/home/intro-spikes/IntroEngineD";
import { IntroEngineE } from "@/components/home/intro-spikes/IntroEngineE";
import { IntroEngineF } from "@/components/home/intro-spikes/IntroEngineF";
import { IntroEngineG } from "@/components/home/intro-spikes/IntroEngineG";
import { IntroEngineH } from "@/components/home/intro-spikes/IntroEngineH";
import { IntroEngineI } from "@/components/home/intro-spikes/IntroEngineI";
import { IntroEngineJ } from "@/components/home/intro-spikes/IntroEngineJ";
import { IntroEngineK } from "@/components/home/intro-spikes/IntroEngineK";
import { IntroEngineL } from "@/components/home/intro-spikes/IntroEngineL";
import { IntroEngineM } from "@/components/home/intro-spikes/IntroEngineM";
import { IntroEngineN } from "@/components/home/intro-spikes/IntroEngineN";
import { IntroEngineO } from "@/components/home/intro-spikes/IntroEngineO";
import { IntroEngineP } from "@/components/home/intro-spikes/IntroEngineP";
import { IntroEngineQ } from "@/components/home/intro-spikes/IntroEngineQ";
import { IntroEngineR } from "@/components/home/intro-spikes/IntroEngineR";
import { IntroEngineS } from "@/components/home/intro-spikes/IntroEngineS";
import { IntroEngineT } from "@/components/home/intro-spikes/IntroEngineT";
import { IntroEngineU } from "@/components/home/intro-spikes/IntroEngineU";
import { IntroEngineV } from "@/components/home/intro-spikes/IntroEngineV";
import { IntroEngineW } from "@/components/home/intro-spikes/IntroEngineW";
import { IntroEngineX } from "@/components/home/intro-spikes/IntroEngineX";
import { IntroEngineY } from "@/components/home/intro-spikes/IntroEngineY";
import { IntroEngineA2 } from "@/components/home/intro-spikes/IntroEngineA2";
import { IntroEngineD2 } from "@/components/home/intro-spikes/IntroEngineD2";
import { IntroEngineH2 } from "@/components/home/intro-spikes/IntroEngineH2";
import { IntroEngineN2 } from "@/components/home/intro-spikes/IntroEngineN2";
import { IntroEngineU2 } from "@/components/home/intro-spikes/IntroEngineU2";
import { IntroEngineD3 } from "@/components/home/intro-spikes/IntroEngineD3";
import { PATTERN_LABEL, type IntroPattern } from "@/components/home/intro-spikes/types";
import { useAnimationPhase } from "@/hooks/useAnimationPhase";
import type { AnimationPhase } from "@/components/teaser/types";

const LOGO_SRC = "/logos/tate-neon-hybrid.svg";
const VALID_PATTERNS: IntroPattern[] = [
  "A", "B", "C", "D", "E",
  "F", "G", "H", "I", "J",
  "K", "L", "M", "N", "O",
  "P", "Q", "R", "S", "T",
  "U", "V", "W", "X", "Y",
  "A2", "D2", "H2", "N2", "U2",
  "D3",
];

function readPatternFromUrl(): IntroPattern | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("intro");
  if (raw && (VALID_PATTERNS as string[]).includes(raw)) {
    return raw as IntroPattern;
  }
  return null;
}

export default function TeaserPage() {
  const { phase, setPhase } = useAnimationPhase();
  const previewPattern = useMemo(() => readPatternFromUrl(), []);

  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });

  useEffect(() => {
    const handler = (e: MouseEvent) =>
      setCursorPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  const handlePhaseChange = useCallback(
    (newPhase: AnimationPhase) => {
      setPhase(newPhase);
    },
    [setPhase]
  );

  return (
    <div
      data-testid="teaser-page"
      className="relative min-h-screen bg-[#000000] overflow-x-hidden custom-cursor-area"
    >
      {/* Custom cursor */}
      <motion.div
        data-testid="custom-cursor"
        className="custom-cursor fixed pointer-events-none z-[100] mix-blend-difference"
        animate={{ x: cursorPos.x - 16, y: cursorPos.y - 16 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
      >
        <div className="w-8 h-8 rounded-full border border-[#E6E6E6]/50" />
      </motion.div>

      {/* Grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none z-[2]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />

      {/* BigBang Animation */}
      {phase !== "content" && (() => {
        const Engine = (() => {
          switch (previewPattern) {
            case "A": return IntroEngineA;
            case "B": return IntroEngineB;
            case "C": return IntroEngineC;
            case "D": return IntroEngineD;
            case "E": return IntroEngineE;
            case "F": return IntroEngineF;
            case "G": return IntroEngineG;
            case "H": return IntroEngineH;
            case "I": return IntroEngineI;
            case "J": return IntroEngineJ;
            case "K": return IntroEngineK;
            case "L": return IntroEngineL;
            case "M": return IntroEngineM;
            case "N": return IntroEngineN;
            case "O": return IntroEngineO;
            case "P": return IntroEngineP;
            case "Q": return IntroEngineQ;
            case "R": return IntroEngineR;
            case "S": return IntroEngineS;
            case "T": return IntroEngineT;
            case "U": return IntroEngineU;
            case "V": return IntroEngineV;
            case "W": return IntroEngineW;
            case "X": return IntroEngineX;
            case "Y": return IntroEngineY;
            case "A2": return IntroEngineA2;
            case "D2": return IntroEngineD2;
            case "H2": return IntroEngineH2;
            case "N2": return IntroEngineN2;
            case "U2": return IntroEngineU2;
            case "D3": return IntroEngineD3;
            default: return BigBangCanvas;
          }
        })();
        return (
          <>
            <Engine onPhaseChange={handlePhaseChange} />
            {previewPattern && (
              <div className="absolute top-4 left-4 z-[110] px-3 py-1.5 bg-black/80 border border-[#F6FF54]/40 rounded-sm pointer-events-none">
                <span className="text-[#F6FF54] text-xs tracking-[0.2em] font-bold">
                  PREVIEW: {previewPattern} — {PATTERN_LABEL[previewPattern]}
                </span>
              </div>
            )}
          </>
        );
      })()}

      {/* Teaser Content — fades in after animation completes */}
      {phase === "content" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Ambient lighting */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#306EC3]/[0.06] rounded-full blur-[200px]" />
            <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#11317B]/[0.05] rounded-full blur-[150px]" />
          </div>

          <TeaserContent logoSrc={LOGO_SRC} />
        </motion.div>
      )}
    </div>
  );
}
