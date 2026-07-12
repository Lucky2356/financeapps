"use client";

import { useEffect, useRef, useState } from "react";

// Animates a number from 0 up to `target` once on mount (and whenever `target`
// changes). Honours prefers-reduced-motion by snapping straight to the final
// value. Returns the current value for the caller to format however it likes.
//
// Initial state is the target (so SSR and first client paint agree — no
// hydration mismatch); the animation, which runs only on the client, rolls the
// value up from 0 on the next frame.
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || !Number.isFinite(target)) {
      // Snap to the target (async, via a frame, so we never setState in the
      // effect body). Covers reduced-motion and the SSR/test env.
      frameRef.current = requestAnimationFrame(() => setValue(target));
      return () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      };
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(target * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs]);

  return value;
}
