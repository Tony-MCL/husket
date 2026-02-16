// ===============================
// src/animation/FlyToTargetProvider.tsx
// ===============================
import React, { createContext, useCallback, useMemo, useRef, useState } from "react";

type FlyArgs = {
  sourceEl: HTMLElement;
  targetId: string;
  onComplete?: () => void;
};

type Ctx = {
  registerTarget: (id: string, el: HTMLElement | null) => void;
  flyToTarget: (args: FlyArgs) => void;
  isAnimating: boolean;
};

export const FlyToTargetContext = createContext<Ctx | null>(null);

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function rectWithScroll(r: DOMRect): { left: number; top: number; width: number; height: number } {
  return {
    left: r.left + window.scrollX,
    top: r.top + window.scrollY,
    width: r.width,
    height: r.height,
  };
}

function pulseTarget(el: HTMLElement) {
  try {
    el.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }],
      { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    );
  } catch {
    // ignore
  }
}

function copyImportantStyles(from: HTMLElement, to: HTMLElement) {
  const cs = window.getComputedStyle(from);
  to.style.borderRadius = cs.borderRadius;
  to.style.boxShadow = cs.boxShadow;
  to.style.border = cs.border;
  to.style.background = cs.background;
  to.style.overflow = "hidden";
}

export function FlyToTargetProvider({ children }: { children: React.ReactNode }) {
  const targetsRef = useRef<Map<string, HTMLElement>>(new Map());
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const animatingRef = useRef(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const registerTarget = useCallback((id: string, el: HTMLElement | null) => {
    if (!id) return;
    if (!el) {
      targetsRef.current.delete(id);
      return;
    }
    targetsRef.current.set(id, el);
  }, []);

  const flyToTarget = useCallback((args: FlyArgs) => {
    const { sourceEl, targetId, onComplete } = args;
    if (animatingRef.current) return;

    const targetEl = targetsRef.current.get(targetId);
    if (!targetEl) {
      onComplete?.();
      return;
    }

    const overlay = overlayRef.current;
    if (!overlay) {
      onComplete?.();
      return;
    }

    const sourceRect = rectWithScroll(sourceEl.getBoundingClientRect());
    const targetRect = rectWithScroll(targetEl.getBoundingClientRect());

    if (sourceRect.width <= 2 || sourceRect.height <= 2 || targetRect.width <= 2 || targetRect.height <= 2) {
      onComplete?.();
      return;
    }

    animatingRef.current = true;
    setIsAnimating(true);

    const clone = sourceEl.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true");
    clone.style.position = "absolute";
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${sourceRect.width}px`;
    clone.style.height = `${sourceRect.height}px`;
    clone.style.margin = "0";
    clone.style.pointerEvents = "none";
    clone.style.transformOrigin = "center center";
    clone.style.zIndex = "1000";
    clone.style.willChange = "transform, opacity";

    copyImportantStyles(sourceEl, clone);

    const sx = sourceRect.left + sourceRect.width / 2;
    const sy = sourceRect.top + sourceRect.height / 2;
    const tx = targetRect.left + targetRect.width / 2;
    const ty = targetRect.top + targetRect.height / 2;
    const dx = tx - sx;
    const dy = ty - sy;

    // “Edge-minimize” look: shrink hard into the button, but keep it readable.
    const fitW = targetRect.width * 0.55;
    const fitH = targetRect.height * 0.55;
    const scale = clamp(Math.min(fitW / sourceRect.width, fitH / sourceRect.height), 0.18, 0.5);

    overlay.appendChild(clone);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;

      try {
        clone.remove();
      } catch {
        // ignore
      }

      pulseTarget(targetEl);
      onComplete?.();

      animatingRef.current = false;
      setIsAnimating(false);
    };

    try {
      const anim = clone.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.92 },
        ],
        {
          duration: 420,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          fill: "forwards",
        }
      );
      anim.onfinish = finish;

      // Safety fallback (rare WAAPI edge cases)
      window.setTimeout(finish, 700);
    } catch {
      finish();
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      registerTarget,
      flyToTarget,
      isAnimating,
    }),
    [registerTarget, flyToTarget, isAnimating]
  );

  return (
    <FlyToTargetContext.Provider value={value}>
      {children}
      <div
        ref={overlayRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1000,
        }}
      />
    </FlyToTargetContext.Provider>
  );
}
