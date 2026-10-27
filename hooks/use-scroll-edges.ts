"use client";

import { useEffect, useState, type RefObject } from "react";

export type ScrollEdges = { start: boolean; end: boolean };

/**
 * Есть ли у горизонтальной полосы что-то за краем — слева (`start`) и справа
 * (`end`). По этому полоса гасит край, за которым продолжение: без намёка
 * последняя вкладка на телефоне обрывалась на «Subsc», и было не понять, что
 * полоса прокручивается и там есть ещё.
 *
 * Пересчёт — на прокрутку, на смену размера и на смену содержимого (вкладку
 * скрыли в настройках, сменился язык и подписи стали длиннее).
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      // Пиксель запаса: дробные ширины при масштабе экрана не дают сойтись точно.
      const start = element.scrollLeft > 1;
      const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setEdges((current) =>
        current.start === start && current.end === end ? current : { start, end }
      );
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(element);
    const mutation = new MutationObserver(measure);
    mutation.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      element.removeEventListener("scroll", measure);
      resize?.disconnect();
      mutation.disconnect();
    };
  }, [ref]);

  return edges;
}

/** Значение для `data-fade`: какие края полосы гасить. */
export function fadeAttribute(edges: ScrollEdges): "both" | "start" | "end" | undefined {
  if (edges.start && edges.end) return "both";
  if (edges.start) return "start";
  if (edges.end) return "end";
  return undefined;
}
