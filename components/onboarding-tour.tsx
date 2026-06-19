"use client";

import {
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Command,
  Download,
  PiggyBank,
  Sparkles,
  Wallet
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ONBOARDING_REPLAY_EVENT, ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";

const STEPS = [
  {
    icon: CircleDollarSign,
    title: "Добро пожаловать в Финансовый помощник",
    description:
      "Все данные хранятся локально на вашем устройстве — без облака. Хотите посмотреть приложение на готовом примере или начать с чистого листа? «Загрузить пример» можно будет очистить в любой момент в Настройках."
  },
  {
    icon: Wallet,
    title: "1. Добавьте счета",
    description:
      "На вкладке «Счета» создайте свои счета (наличные, карта, накопительный, брокерский) и укажите текущий баланс. С них будут учитываться операции."
  },
  {
    icon: CircleDollarSign,
    title: "2. Записывайте операции",
    description:
      "Нажмите «Операция» на главной или клавиши Alt+N, чтобы быстро добавить доход или расход. Прямо в окне можно создать новый счёт и новую категорию. Категория подбирается по описанию автоматически."
  },
  {
    icon: BarChart3,
    title: "3. Бюджеты и аналитика",
    description:
      "Задайте лимиты по категориям на вкладке «Бюджеты» (можно нажать «Предложить лимиты» — посчитаем по вашим средним тратам). На «Аналитике» смотрите динамику и структуру расходов."
  },
  {
    icon: PiggyBank,
    title: "4. Цели и подушка",
    description:
      "Создавайте накопительные цели и пополняйте их со счёта. На главной видно прогресс финансовой подушки и свободный остаток, который можно сразу отложить на цель."
  },
  {
    icon: Download,
    title: "5. Импорт и backup",
    description:
      "На вкладке «Импорт» можно загрузить CSV из банка, выбрать пресет колонок и скачать резервную копию. Перед восстановлением мы покажем preview, чтобы случайно не заменить данные не тем файлом."
  },
  {
    icon: CalendarClock,
    title: "6. Прогноз и инвестиции",
    description:
      "Добавляйте плановые платежи — «Прогноз» построит денежный поток и календарь на 90 дней. На «Инвестициях» можно подобрать бумаги под бюджет и риск-профиль."
  },
  {
    icon: Command,
    title: "Подсказка: быстрый поиск",
    description:
      "Нажмите Ctrl+K в любой момент, чтобы открыть командную палитру — быстрый переход по разделам и поиск счетов и категорий. Готово, можно начинать!"
  }
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loadingSample, setLoadingSample] = useState(false);

  async function loadSample() {
    setLoadingSample(true);
    try {
      await apiClient.post("/sample", {});
      markDone();
      window.location.reload();
    } catch (error) {
      setLoadingSample(false);
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить пример");
    }
  }

  useEffect(() => {
    // localStorage is only available on the client, so this first-run check must
    // run in an effect rather than during render.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) setOpen(true);
    } catch {
      /* localStorage unavailable — skip onboarding */
    }
  }, []);

  useEffect(() => {
    function replayOnboarding() {
      setStep(0);
      setOpen(true);
    }

    window.addEventListener(ONBOARDING_REPLAY_EVENT, replayOnboarding);
    return () => window.removeEventListener(ONBOARDING_REPLAY_EVENT, replayOnboarding);
  }, []);

  function markDone() {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function finish() {
    markDone();
    setOpen(false);
  }

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) finish();
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Icon className="size-6" />
          </span>
          <DialogTitle className="mt-3">{current.title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{current.description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 py-2">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={
                index === step
                  ? "h-1.5 w-5 rounded-full bg-primary"
                  : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30"
              }
            />
          ))}
        </div>

        <DialogFooter className="items-stretch gap-3 sm:items-center sm:justify-between">
          <Button
            className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
            variant="ghost"
            onClick={finish}
          >
            Пропустить обучение
          </Button>
          <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:w-auto">
            {step === 0 ? (
              <>
                <Button
                  className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={loadingSample}
                >
                  Начать с нуля
                </Button>
                <Button
                  className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                  onClick={() => void loadSample()}
                  disabled={loadingSample}
                >
                  <Sparkles className="size-4" />
                  {loadingSample ? "Загрузка…" : "Загрузить пример"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                >
                  Назад
                </Button>
                {isLast ? (
                  <Button
                    className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                    onClick={finish}
                  >
                    Начать
                  </Button>
                ) : (
                  <Button
                    className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                    onClick={() => setStep((s) => s + 1)}
                  >
                    Далее
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
