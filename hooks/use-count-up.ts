"use client";

import { useEffect, useRef, useState } from "react";

// Плавная смена числа. На первом показе — от нуля до значения (так раньше
// появлялся капитал на главной); дальше — от ПРЕЖНЕГО значения к новому:
// записали трату — «Можно тратить» не обнуляется и не считает заново с нуля, а
// съезжает на эти 450 ₽. Кто просил систему не двигать ничего — получает число
// сразу.
//
// Начальное состояние — само значение: первая отрисовка на сервере и в окне
// совпадают; движение начинается со следующего кадра и только в окне.
export function useCountUp(
  target: number,
  durationMs = 700,
  options: { fromZero?: boolean } = {}
): number {
  const fromZero = options.fromZero ?? true;
  const [value, setValue] = useState(target);
  const frameRef = useRef<number | null>(null);
  // Что показано сейчас — от него и поедет следующая смена, даже если прежнее
  // движение ещё не доехало.
  const shownRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = shownRef.current ?? (fromZero ? 0 : target);

    if (reduced || !Number.isFinite(target) || !Number.isFinite(from) || from === target) {
      // Сразу к значению — через кадр, чтобы не менять состояние в теле эффекта.
      frameRef.current = requestAnimationFrame(() => {
        shownRef.current = target;
        setValue(target);
      });
      return () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      };
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = progress < 1 ? from + (target - from) * eased : target;
      shownRef.current = current;
      setValue(current);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs, fromZero]);

  return value;
}

/**
 * Куда сдвинулось значение — «up» или «down» на `holdMs` после смены, иначе
 * null. Первое значение сменой не считается: открыли экран — ничего не
 * «выросло».
 */
export function useChangeDirection(target: number, holdMs = 900): "up" | "down" | null {
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = target;
    if (before === null || !Number.isFinite(before) || before === target) return;
    const frame = requestAnimationFrame(() => setDirection(target > before ? "up" : "down"));
    const timer = window.setTimeout(() => setDirection(null), holdMs);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [target, holdMs]);

  return direction;
}
