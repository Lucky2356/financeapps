"use client";

// Глаз рядом с поиском: спрятать суммы одним нажатием — в метро, в очереди,
// когда экран видит кто-то ещё. Та же настройка есть в «Основных», но искать
// её в настройках, пока сосед заглядывает через плечо, — поздно.

import { Eye, EyeOff } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useI18n } from "@/lib/i18n/context";
import { PREFERENCES_CHANGED, areAmountsHidden, setAmountsHidden } from "@/lib/preferences";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void) {
  window.addEventListener(PREFERENCES_CHANGED, onChange);
  return () => window.removeEventListener(PREFERENCES_CHANGED, onChange);
}

export function useAmountsHidden(): boolean {
  return useSyncExternalStore(subscribe, areAmountsHidden, () => false);
}

export function AmountsToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const hidden = useAmountsHidden();
  const label = hidden ? t("prefs.showAmounts") : t("prefs.hideAmounts");
  const Icon = hidden ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={hidden}
      data-testid="amounts-toggle"
      onClick={() => setAmountsHidden(!hidden)}
      className={cn(
        "flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-foreground/[0.07]",
        className
      )}
    >
      <Icon className="size-[17px]" />
    </button>
  );
}
