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

function MotionConfig({
  children,
}: {
  children: React.ReactNode;
  reducedMotion?: string;
}) {
  return <>{children}</>;
}

function useScroll() {
  return { scrollY: { get: () => 0 }, scrollYProgress: { get: () => 0 } };
}

/**
 * 実 API と同じ 2 形態をサポートする。
 *  - useTransform(value, input[], output[]) → output の先頭を返す
 *  - useTransform(value, (latest) => ...)   → 進捗 0 の変換結果を返す
 */
function useTransform(
  value: unknown,
  inputOrTransformer: unknown,
  output?: unknown[]
) {
  if (typeof inputOrTransformer === "function") {
    const latest = (value as { get?: () => unknown })?.get?.() ?? 0;
    return (inputOrTransformer as (latest: unknown) => unknown)(latest);
  }
  return output?.[0];
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

let mockReducedMotion = false;

function setMockReducedMotion(value: boolean) {
  mockReducedMotion = value;
}

function useReducedMotion() {
  return mockReducedMotion;
}

export {
  motion,
  AnimatePresence,
  MotionConfig,
  useScroll,
  useTransform,
  useInView,
  useMotionValue,
  useReducedMotion,
  setMockUseInView,
  setMockReducedMotion,
};
