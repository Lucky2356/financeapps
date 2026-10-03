"use client";

// Забрать накопленные уведомления банка у телефона и превратить в предложения.
//
// При запуске и каждый раз, когда приложение снова на экране: заплатили в
// магазине, открыли приложение — трата уже ждёт на главной. Включается в
// настройках («Траты из уведомлений банка»); выключено — не трогаем ничего.

import { useEffect } from "react";

import { parseBankNotification, type BankSuggestion } from "@/lib/bank/notification-parse";
import {
  BANK_ENABLED_KEY,
  BANK_EVENT,
  BANK_HANDLED_KEY,
  BANK_SUGGESTIONS_KEY,
  mergeSuggestions,
  parseHandled,
  parseStored
} from "@/lib/bank/suggestions";
import { takeBankNotifications } from "@/lib/platform/android-bank";
import { isAndroidShell } from "@/lib/platform/device";
import { readMine, writeMine } from "@/lib/storage/mine";

export function BankWatch() {
  useEffect(() => {
    if (!isAndroidShell()) return;
    async function look() {
      if (readMine(BANK_ENABLED_KEY) !== "1") return;
      const items = await takeBankNotifications();
      const fresh = items
        .map((item) => parseBankNotification(item))
        .filter((item): item is BankSuggestion => item !== null);
      if (fresh.length === 0) return;
      const merged = mergeSuggestions(
        parseStored(readMine(BANK_SUGGESTIONS_KEY)),
        fresh,
        Date.now(),
        parseHandled(readMine(BANK_HANDLED_KEY))
      );
      writeMine(BANK_SUGGESTIONS_KEY, JSON.stringify(merged));
      window.dispatchEvent(new Event(BANK_EVENT));
    }
    void look();
    const again = () => {
      if (document.visibilityState === "visible") void look();
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, []);
  return null;
}
