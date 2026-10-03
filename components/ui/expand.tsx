"use client";

// Раскрываемое — разворачивается и сворачивается, а не выпрыгивает.
//
// Пока закрыто, содержимого в документе нет вовсе (как было с `open ? … :
// null`): его не находит ни поиск по странице, ни Tab, ни проверки. Открыли —
// оно появляется свёрнутым и на следующем кадре разворачивается (.expand в
// globals.css); закрыли — сворачивается и только потом исчезает.

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const CLOSE_MS = 300;

export function Expand({
  open,
  children,
  className
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      let second = 0;
      const first = requestAnimationFrame(() => {
        setMounted(true);
        // Ещё кадр: свёрнутое должно успеть встать, чтобы было откуда разворачиваться.
        second = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    const frame = requestAnimationFrame(() => setShown(false));
    const timer = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!mounted && !open) return null;
  return (
    <div className={cn("expand", className)} data-open={shown && open}>
      <div>{children}</div>
    </div>
  );
}
