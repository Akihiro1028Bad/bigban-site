import type { AnimationPhase } from "@/components/teaser/types";

export type IntroPattern =
  | "A" | "B" | "C" | "D" | "E"
  | "F" | "G" | "H" | "I" | "J"
  | "K" | "L" | "M" | "N" | "O"
  | "P" | "Q" | "R" | "S" | "T"
  | "U" | "V" | "W" | "X" | "Y"
  | "A2" | "D2" | "H2" | "N2" | "U2"
  | "D3";

export interface IntroEngineProps {
  onPhaseChange: (phase: AnimationPhase) => void;
}

export const PATTERN_LABEL: Record<IntroPattern, string> = {
  A: "NEON SHOCKWAVE",
  B: "TYPE IGNITION",
  C: "PORTAL OPENING",
  D: "STARFIELD WARP",
  E: "PARTICLE VORTEX",
  F: "SUPERNOVA BLOOM",
  G: "GLITCH REVEAL",
  H: "PICKLEBALL IMPACT",
  I: "KINETIC GRID",
  J: "LIQUID INK",
  K: "NEURAL PULSE",
  L: "CONSTELLATION",
  M: "ORIGAMI UNFOLD",
  N: "HOLOGRAM SCAN",
  O: "KALEIDOSCOPE",
  P: "CINEMATIC WIPE",
  Q: "LIQUID SPLIT",
  R: "MAGNETIC DUST",
  S: "PAPER TEAR",
  T: "RIBBON DANCE",
  U: "COSMIC SERVE",
  V: "UNIVERSE BIRTH",
  W: "GALAXY BALL",
  X: "COURT COSMOS",
  Y: "RALLY CASCADE",
  A2: "NEON SHOCKWAVE+",
  D2: "STARFIELD WARP+",
  H2: "PICKLEBALL IMPACT+",
  N2: "HOLOGRAM SCAN+",
  U2: "COSMIC SERVE+",
  D3: "STARFIELD WARP+ (no landing)",
};
