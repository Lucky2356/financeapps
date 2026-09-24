"use client";

// Ворота перед приложением: пока книга заперта, показываются они, а не экраны.
//
// Именно ВМЕСТО, а не поверх. Пусти мы экраны отрисоваться под замком, каждый
// из них полез бы читать книгу, получил бы «заперто» и показал бы пустоту —
// человек увидел бы приложение без единого счёта и операции и решил бы, что
// всё пропало. Поэтому запертое состояние не пускает вниз ничего.

import { useCallback, useEffect, useRef, useState } from "react";

import { FirstRun } from "@/components/vault/first-run";
import { UnlockScreen } from "@/components/vault/unlock-screen";
import { useI18n } from "@/lib/i18n/context";
import { WhoIsIt } from "@/components/vault/who-is-it";
import {
  accountService,
  listPeople,
  peopleReady,
  personAlreadyChosen,
  resumeSync,
  stopSync,
  type PersonCard
} from "@/lib/vault/runtime";

type Phase = "checking" | "who" | "fresh" | "locked" | "open";

export function VaultGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("checking");
  const [people, setPeople] = useState<PersonCard[]>([]);

  // Спрашиваем «кто это» РОВНО ОДИН РАЗ за жизнь вкладки. Иначе каждое
  // «vault-changed» — заперли, забыли устройство — возвращало бы человека к
  // выбору, хотя он никуда не уходил.
  const asked = useRef(false);

  const refresh = useCallback(async () => {
    try {
      // Сперва — чьи данные открываем, и только потом — заперты ли они.
      //
      // Порядок обязательный. Спроси мы замок раньше, вопрос ушёл бы в
      // хранилище, ещё не знающее, чьё оно, — и человек с заведённым паролем
      // увидел бы первый запуск поверх собственных данных.
      await peopleReady;

      // «Кто это» показывается, только когда людей больше одного.
      //
      // Одному этот экран не говорит ничего и лишь добавляет нажатие к каждому
      // запуску — а укоротить путь до первой операции было смыслом целого
      // выпуска. Удлинять его здесь же было бы смешно.
      //
      // Спрашивается это ПОСЛЕ выбора человека и ДО замка: список уже прочитан,
      // а чей замок открывать — ещё вопрос.
      if (!asked.current && !personAlreadyChosen()) {
        asked.current = true;
        const here = await listPeople();
        if (here.length > 1) {
          setPeople(here);
          setPhase("who");
          return;
        }
      }

      const { status } = await accountService.state();
      // Первому запуску нужно знать, есть ли к кому вернуться: только что
      // добавленный человек попадает сюда, минуя выбор, — и без этого списка
      // уйти обратно к себе ему было бы некуда.
      if (status === "fresh") setPeople(await listPeople());
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
      } else {
        // Заперли — синхронизацию останавливаем здесь же, где и поднимаем.
        //
        // Иначе поток событий остаётся висеть, и каждое приехавшее изменение
        // упирается в запертое хранилище: слияние открывает книгу, а ключа в
        // памяти больше нет. Человек при этом видит «ошибка связи», хотя связь
        // в полном порядке — заперта книга. Отправка ничего не теряет: всё
        // ненаписанное остаётся в очереди и уедет, как только отопрут.
        stopSync();
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

  if (phase === "who") return <WhoIsIt people={people} />;
  if (phase === "fresh") {
    return (
      <FirstRun onDone={refresh} onLeave={people.length > 1 ? () => setPhase("who") : undefined} />
    );
  }
  if (phase === "locked") return <UnlockScreen onDone={refresh} />;
  return <>{children}</>;
}

/** Сказать воротам, что состояние замка изменилось. */
export function announceVaultChanged(): void {
  window.dispatchEvent(new Event("vault-changed"));
}
