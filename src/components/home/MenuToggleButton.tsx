"use client";

import { motion } from "framer-motion";

interface MenuToggleButtonProps {
  isOpen: boolean;
  onClick: () => void;
  labelOpen: string;
  labelClose: string;
  className?: string;
}

const TOP = {
  closed: { rotate: 0, y: 0 },
  open: { rotate: 45, y: 6 },
};
const MIDDLE = {
  closed: { opacity: 1 },
  open: { opacity: 0 },
};
const BOTTOM = {
  closed: { rotate: 0, y: 0 },
  open: { rotate: -45, y: -6 },
};

const lineStyle = { transformBox: "fill-box", transformOrigin: "center" } as const;

export default function MenuToggleButton({
  isOpen,
  onClick,
  labelOpen,
  labelClose,
  className = "",
}: MenuToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? labelClose : labelOpen}
      aria-expanded={isOpen}
      className={`flex h-10 w-10 items-center justify-center rounded-full border bg-deep-black/40 backdrop-blur-md transition-colors hover:border-accent hover:text-accent ${
        isOpen ? "border-accent text-accent" : "border-white/15 text-text-light"
      } ${className}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <motion.line
          x1="3" y1="6" x2="21" y2="6"
          variants={TOP}
          animate={isOpen ? "open" : "closed"}
          initial={false}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          style={lineStyle}
        />
        <motion.line
          x1="3" y1="12" x2="21" y2="12"
          variants={MIDDLE}
          animate={isOpen ? "open" : "closed"}
          initial={false}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          style={lineStyle}
        />
        <motion.line
          x1="3" y1="18" x2="21" y2="18"
          variants={BOTTOM}
          animate={isOpen ? "open" : "closed"}
          initial={false}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          style={lineStyle}
        />
      </svg>
    </button>
  );
}
