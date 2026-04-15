"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { IntroEngineProps } from "./types";
import type { AnimationPhase } from "@/components/teaser/types";

const BRAND_YELLOW = "#F6FF54";
const BRAND_BLUE = "#306EC3";

interface WarpStar {
  x: number;
  y: number;
  z: number;
  prevZ: number;
  colorT: number;
}

// D2 と同じだが "settle (着地)" フェーズなしで burst 後そのまま content へ
const DURATION = {
  drift: 900,
  accel: 1800,
  hyperspace: 700,
  burst: 1300,
};

const STAR_COUNT = 420;
const STAR_Z_MAX = 1400;

export function IntroEngineD3({ onPhaseChange }: IntroEngineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const phaseRef = useRef<AnimationPhase>("dark");
  const startTimeRef = useRef<number>(0);
  const starsRef = useRef<WarpStar[]>([]);

  const [isReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (isReducedMotion) onPhaseChange("content");
  }, [isReducedMotion, onPhaseChange]);

  const setPhase = useCallback(
    (phase: AnimationPhase) => {
      if (phaseRef.current !== phase) {
        phaseRef.current = phase;
        onPhaseChange(phase);
      }
    },
    [onPhaseChange]
  );

  useEffect(() => {
    if (isReducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    starsRef.current = Array.from({ length: STAR_COUNT }, () => {
      const z = Math.random() * STAR_Z_MAX;
      return {
        x: (Math.random() - 0.5) * window.innerWidth * 2,
        y: (Math.random() - 0.5) * window.innerHeight * 2,
        z,
        prevZ: z,
        colorT: Math.random(),
      };
    });

    setPhase("dark");
    startTimeRef.current = performance.now();

    const T_DRIFT = DURATION.drift;
    const T_ACCEL = T_DRIFT + DURATION.accel;
    const T_HYPER = T_ACCEL + DURATION.hyperspace;
    const T_BURST = T_HYPER + DURATION.burst;

    const render = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const cx = W / 2;
      const cy = H / 2;

      // Motion trail
      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      ctx.fillRect(0, 0, W, H);

      if (elapsed < T_HYPER) {
        // Stars fly (drift → accel → hyperspace)
        let speed = 1.5;
        let phaseProgress = 0;
        if (elapsed < T_DRIFT) {
          speed = 2;
        } else if (elapsed < T_ACCEL) {
          phaseProgress = (elapsed - T_DRIFT) / DURATION.accel;
          speed = 2 + Math.pow(phaseProgress, 2.5) * 60;
          if (phaseRef.current === "dark") setPhase("converge");
        } else {
          phaseProgress = 1;
          speed = 80;
        }

        starsRef.current.forEach((s) => {
          s.prevZ = s.z;
          s.z -= speed;
          if (s.z <= 0) {
            s.x = (Math.random() - 0.5) * W * 2;
            s.y = (Math.random() - 0.5) * H * 2;
            s.z = STAR_Z_MAX;
            s.prevZ = STAR_Z_MAX;
            s.colorT = Math.random();
          }

          const scale = 220 / s.z;
          const prevScale = 220 / s.prevZ;
          const sx = cx + s.x * scale;
          const sy = cy + s.y * scale;
          const psx = cx + s.x * prevScale;
          const psy = cy + s.y * prevScale;

          const alpha = Math.min(1, (STAR_Z_MAX - s.z) / STAR_Z_MAX + 0.25);
          // Color shift based on speed: blue (cool) → white → yellow (hot)
          let color;
          if (phaseProgress < 0.4) color = `rgba(200, 220, 255, ${alpha})`;
          else if (phaseProgress < 0.75) color = `rgba(255, 255, 255, ${alpha})`;
          else color = s.colorT < 0.6
            ? `rgba(246, 255, 84, ${alpha})`
            : `rgba(255, 255, 255, ${alpha})`;

          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.6, 3 - s.z / 400);
          ctx.beginPath();
          ctx.moveTo(psx, psy);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        });

        // Lens flare anamorphic streak at hyperspace peak
        if (phaseProgress > 0.75) {
          const f = (phaseProgress - 0.75) / 0.25;
          const streakAlpha = f * 0.6;

          // Horizontal streak
          const hGrad = ctx.createLinearGradient(0, cy, W, cy);
          hGrad.addColorStop(0, "rgba(48, 110, 195, 0)");
          hGrad.addColorStop(0.5, `rgba(246, 255, 84, ${streakAlpha})`);
          hGrad.addColorStop(1, "rgba(48, 110, 195, 0)");
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = hGrad;
          ctx.fillRect(0, cy - 4, W, 8);

          // Vertical streak
          const vGrad = ctx.createLinearGradient(cx, 0, cx, H);
          vGrad.addColorStop(0, "rgba(246, 255, 84, 0)");
          vGrad.addColorStop(0.5, `rgba(255, 255, 255, ${streakAlpha * 0.8})`);
          vGrad.addColorStop(1, "rgba(246, 255, 84, 0)");
          ctx.fillStyle = vGrad;
          ctx.fillRect(cx - 2, 0, 4, H);
          ctx.globalCompositeOperation = "source-over";

          // Central flare glow
          const flareGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 300);
          flareGrad.addColorStop(0, `rgba(255, 255, 255, ${f * 0.9})`);
          flareGrad.addColorStop(0.4, `rgba(246, 255, 84, ${f * 0.5})`);
          flareGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = flareGrad;
          ctx.fillRect(0, 0, W, H);
        }
      } else if (elapsed < T_BURST) {
        if (phaseRef.current === "converge") setPhase("explode");
        const t = (elapsed - T_HYPER) / DURATION.burst;

        // Mega flash
        const flashAlpha = Math.max(0, 1 - t * 1.8);
        if (flashAlpha > 0) {
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H));
          grad.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
          grad.addColorStop(0.25, `rgba(246, 255, 84, ${flashAlpha * 0.85})`);
          grad.addColorStop(0.6, `rgba(48, 110, 195, ${flashAlpha * 0.35})`);
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);
        }

        // Triple shockwave rings
        for (let i = 0; i < 3; i++) {
          const ringR = (t * Math.max(W, H)) * (0.6 + i * 0.3);
          const ringAlpha = Math.max(0, 1 - t * 1.1) * (1 - i * 0.2);
          if (ringAlpha > 0) {
            ctx.globalAlpha = ringAlpha;
            ctx.strokeStyle = i === 0 ? BRAND_YELLOW : i === 1 ? "#ffffff" : BRAND_BLUE;
            ctx.lineWidth = 4 - i;
            ctx.shadowBlur = 25;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Stars still visible but stationary, slowing
        starsRef.current.forEach((s) => {
          s.z -= 2;
          const scale = 220 / Math.max(1, s.z);
          const sx = cx + s.x * scale;
          const sy = cy + s.y * scale;
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - t) * 0.6})`;
          ctx.fillRect(sx, sy, 2, 2);
        });
      } else {
        if (phaseRef.current === "explode") setPhase("content");
        return;
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [isReducedMotion, setPhase]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
