"use client";

// Открыли приложение ссылкой из QR-кода — отвести туда, где она нужна.
//
// Код нового устройства (обратная связка) → ответить на него своими данными.
// Код устройства с данными (прямая) → подключить это устройство. Оба — в
// разделе «Синхронизация», с уже подставленной ссылкой: ничего не надо ни
// снимать второй раз, ни вставлять.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { takeIncomingLink } from "@/lib/sync/incoming-link";
import { readPairing } from "@/lib/sync/pairing-link";
import { readShortcutLink, requestQuickAdd } from "@/lib/transactions/quick-add-request";

export function IncomingLinkWatch() {
  const router = useRouter();

  useEffect(() => {
    async function look() {
      const link = await takeIncomingLink();
      // Ярлык на значке: «Расход», «Доход», «Сканировать чек».
      const shortcut = link ? readShortcutLink(link) : null;
      if (shortcut) {
        requestQuickAdd(shortcut);
        return;
      }
      const parsed = link ? readPairing(link) : null;
      if (!link || !parsed) return;
      const kind = parsed.ticket ? "answer" : "join";
      router.push(`/settings?section=sync&${kind}=${encodeURIComponent(link)}`);
    }
    void look();
    // Приложение уже было открыто, и его вызвали ссылкой ещё раз.
    const again = () => {
      if (document.visibilityState === "visible") void look();
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [router]);

  return null;
}
