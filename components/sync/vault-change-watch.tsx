"use client";

// Что вышло со службой после смены пароля.
//
// Пароль меняется на устройстве сразу, а до службы новый может и не доехать:
// нет связи, служба старая, служба отказала. Пока не доехал, на службе
// действует ПРЕЖНИЙ пароль — им можно войти со свежего устройства и открыть
// книгу. Промолчать об этом значило бы оставить человека уверенным, что
// подсмотренный пароль больше ничего не открывает.

import { useEffect } from "react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n/context";
import type { VaultPush } from "@/lib/vault/server-account";
import { VAULT_PUSHED, type VaultPushedDetail } from "@/lib/vault/runtime";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Сказать человеку об исходе отправки.
 *
 * `background` — отправка шла сама (при запуске, после сверки). Тогда «нет
 * связи» не говорится: о нём уже сказали при смене, и повторять его на каждом
 * запуске без сети незачем — отправка просто ждёт.
 */
export function tellVaultPush(outcome: VaultPush, t: Translate, background = false): void {
  switch (outcome.kind) {
    case "sent":
      toast.success(t("vault.server.sent"));
      return;
    case "offline":
      if (!background) toast.warning(t("vault.server.offline"), { duration: 10_000 });
      return;
    case "outdated":
      toast.warning(t("vault.server.outdated"), { duration: 15_000 });
      return;
    case "failed":
      toast.warning(t("vault.server.later", { message: outcome.message }), { duration: 15_000 });
      return;
    case "refused":
      toast.error(t("vault.server.refused", { message: outcome.message }), { duration: 15_000 });
      return;
    default:
      // «idle» и «skipped» — сказать нечего: службы нет или менять на ней нечего.
      return;
  }
}

/** Слушает фоновые отправки — см. VAULT_PUSHED в lib/vault/runtime.ts. */
export function VaultChangeWatch() {
  const { t } = useI18n();

  useEffect(() => {
    const heard = (event: Event) => {
      const detail = (event as CustomEvent<VaultPushedDetail>).detail;
      if (detail?.outcome) tellVaultPush(detail.outcome, t, true);
    };
    window.addEventListener(VAULT_PUSHED, heard);
    return () => window.removeEventListener(VAULT_PUSHED, heard);
  }, [t]);

  return null;
}
