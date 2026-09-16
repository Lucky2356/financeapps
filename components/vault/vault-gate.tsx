"use client";

// Ворота перед приложением: пока книга заперта, показываются они, а не экраны.
//
// Именно ВМЕСТО, а не поверх. Пусти мы экраны отрисоваться под замком, каждый
// из них полез бы читать книгу, получил бы «заперто» и показал бы пустоту —
// человек увидел бы приложение без единого счёта и операции и решил бы, что
// всё пропало. Поэтому запертое состояние не пускает вниз ничего.

import { useCallback, useEffect, useState } from "react";

import { FirstRun } from "@/components/vault/first-run";
import { UnlockScreen } from "@/components/vault/unlock-screen";
import { useI18n } from "@/lib/i18n/context";
import { accountService, resumeSync } from "@/lib/vault/runtime";

type Phase = "checking" | "fresh" | "locked" | "open";

export function VaultGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("checking");

  const refresh = useCallback(async () => {
    try {
      const { status } = await accountService.state();
      setPhase(status === "unlocked" ? "open" : status);

      // Синхронизация поднимается ТОЛЬКО на отпертой книге, и это не порядок
      // вызовов, а необходимость: слияние открывает две книги, а ключ живёт в
      // памяти замка. Запущенная раньше, она уткнулась бы в запертое хранилище
      // на первом же приехавшем изменении.
      //
      // Не ждём: сеть не имеет права задерживать появление приложения на
      // экране, и привязки к серверу у большинства нет вовсе.
      if (status === "unlocked") {
        void resumeSync().catch(() => {
          // Сервер недоступен или билет протух — приложение местное и работает
          // без него. Значок связи скажет об этом сам, когда будет что сказать.
        });
      }
    } catch {
      // Хранилище не открылось вовсе (приватный режим, запрет на запись).
      // Замка в таком окне нет и быть не может — пускаем дальше, приложение
      // само скажет о неработающем хранилище на своём языке.
      setPhase("open");
    }
  }, []);

  useEffect(() => {
    // Отложено на микрозадачу: состояние замка узнаётся из хранилища, то есть
    // асинхронно, и трогать его прямо в теле эффекта незачем.
    void Promise.resolve().then(refresh);
    // «Запереть» и «забыть устройство» из настроек доходят сюда этим событием.
    const relock = () => void refresh();
    window.addEventListener("vault-changed", relock);
    return () => window.removeEventListener("vault-changed", relock);
  }, [refresh]);

  // Пока неизвестно — пусто. Не «приложение», не «замок»: показать приложение и
  // через миг сменить его на замок значит мигнуть человеку в лицо, а показать
  // замок тому, у кого его нет, — напугать на ровном месте.
  if (phase === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30" aria-busy="true">
        <span className="sr-only">{t("vault.checking")}</span>
      </div>
    );
  }

  if (phase === "fresh") return <FirstRun onDone={refresh} />;
  if (phase === "locked") return <UnlockScreen onDone={refresh} />;
  return <>{children}</>;
}

/** Сказать воротам, что состояние замка изменилось. */
export function announceVaultChanged(): void {
  window.dispatchEvent(new Event("vault-changed"));
}
