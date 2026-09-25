"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { readStartScreen } from "@/lib/preferences";

const DONE_KEY = "start-screen-done";

/**
 * Открыть приложение сразу на выбранном экране.
 *
 * Только один раз за запуск и только с главной: человек, который сам ушёл на
 * главную, хочет именно её, а не чтобы его снова увели на «Операции».
 */
export function StartScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const first = useRef(pathname);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DONE_KEY)) return;
      window.sessionStorage.setItem(DONE_KEY, "1");
    } catch {
      return;
    }
    const target = readStartScreen();
    if (target !== "/" && first.current === "/") router.replace(target);
  }, [router]);

  return null;
}
