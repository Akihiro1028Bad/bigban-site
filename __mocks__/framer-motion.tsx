import React from "react";

const ANIMATION_PROPS = new Set([
  "initial",
  "animate",
  "exit",
  "transition",
  "variants",
  "whileInView",
  "whileHover",
  "whileTap",
  "viewport",
  "layout",
  "layoutId",
  "drag",
  "dragConstraints",
  "dragElastic",
  "dragMomentum",
  "onDragEnd",
  "onDragStart",
  "onDrag",
]);

const componentCache: Record<string, React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown } & React.RefAttributes<HTMLElement>>> = {};

const motion = new Proxy(
  {},
  {
    get: (_target, key: string) => {
      if (!componentCache[key]) {
        const Component = React.forwardRef(
          (
            { children, ...props }: React.HTMLAttributes<HTMLElement> & { [key: string]: unknown },
            ref: React.Ref<HTMLElement>
          ) => {
            const filteredProps: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(props)) {
              if (!ANIMATION_PROPS.has(k)) {
                filteredProps[k] = v;
              }
            }
            return React.createElement(key, { ...filteredProps, ref }, children);
          }
        );
        Component.displayName = `motion.${key}`;
        componentCache[key] = Component;
      }
      return componentCache[key];
    },
  }
);

function AnimatePresence({ children }: { children: React.ReactNode; mode?: string }) {
  return <>{children}</>;
}

function useScroll() {
  return { scrollY: { get: () => 0 } };
}

function useTransform(_value: unknown, _input: unknown, output: unknown[]) {
  return output[0];
}

let mockUseInViewValue = false;

function setMockUseInView(value: boolean) {
  mockUseInViewValue = value;
}

function useInView() {
  return mockUseInViewValue;
}

function useMotionValue(initial: unknown) {
  return {
    get: () => initial,
    set: () => {},
    onChange: () => () => {},
  };
}

function useReducedMotion() {
  return false;
}

export { motion, AnimatePresence, useScroll, useTransform, useInView, useMotionValue, useReducedMotion, setMockUseInView };
