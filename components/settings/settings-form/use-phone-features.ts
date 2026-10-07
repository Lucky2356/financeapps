"use client";

import { useEffect, useState } from "react";

import { eveningReminderOn } from "@/components/phone-reminders";
import { BANK_ENABLED_KEY } from "@/lib/bank/suggestions";
import { bankAccess } from "@/lib/platform/android-bank";
import {
  configureLoli,
  LOLI_EVENT,
  loliStatus,
  type LoliStatus
} from "@/lib/platform/android-loli";
import { isAndroidShell } from "@/lib/platform/device";
import { readMine } from "@/lib/storage/mine";

/**
 * То, что есть только на телефоне: вечернее напоминание, траты из уведомлений
 * банка и Лоли. Живёт в SettingsForm, а не в разделе «Финансы», — чтобы
 * состояние и проверки доступа переживали переход между разделами.
 */
export function usePhoneFeatures() {
  // Вечернее напоминание — только на телефоне и только на этом телефоне.
  const [onPhone] = useState(isAndroidShell);
  const [evening, setEvening] = useState(eveningReminderOn);
  // Траты из уведомлений банка: включено ли здесь и дал ли Android доступ.
  const [bankOn, setBankOn] = useState(() => readMine(BANK_ENABLED_KEY) === "1");
  const [bankGranted, setBankGranted] = useState<boolean | null>(null);
  useEffect(() => {
    if (!onPhone) return;
    const check = () => void bankAccess().then(setBankGranted);
    check();
    // Вернулись из настроек телефона — узнать, дали ли доступ.
    const again = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [onPhone]);
  // Лоли — голосовой помощник: стоит ли на телефоне, её ли подпись, что разрешено.
  const [loli, setLoli] = useState<LoliStatus | null>(null);
  useEffect(() => {
    if (!onPhone) return;
    const check = () => void loliStatus().then(setLoli);
    check();
    const again = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [onPhone]);
  function changeLoli(patch: Partial<Pick<LoliStatus, "enabled" | "auto" | "share">>) {
    if (!loli?.installed || !loli.trusted) return;
    const next = { ...loli, ...patch };
    setLoli(next);
    // Записали — и сразу обменялись: забрать присланное и оставить сводку,
    // не дожидаясь следующей правки в учёте.
    void configureLoli({ enabled: next.enabled, auto: next.auto, share: next.share }).then(() =>
      window.dispatchEvent(new Event(LOLI_EVENT))
    );
  }

  return { onPhone, evening, setEvening, bankOn, setBankOn, bankGranted, loli, changeLoli };
}

export type PhoneFeatures = ReturnType<typeof usePhoneFeatures>;
