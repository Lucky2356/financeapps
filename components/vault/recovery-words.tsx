"use client";

// Двенадцать слов кода восстановления — и кнопка «Я записал».
//
// Тем же видом, что в первом запуске, но отдельным блоком: код показывают и
// там, где пароль ставят ПОЗЖЕ — в настройках и при создании учётной записи
// на службе. До 1.46.0 там его не показывали вовсе: пароль появлялся, а слова,
// которые его заменяют, человек не видел ни разу — и в день, когда пароль
// забудется, открыть данные было бы нечем.

import { KeyRound } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

export function RecoveryWords({ code, onDone }: { code: string; onDone: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const words = code.split(" ");

  return (
    <div
      className="space-y-4 rounded-xl border border-primary/40 bg-card p-4 sm:p-5"
      data-testid="recovery-words"
    >
      <p className="flex items-center gap-2 text-base font-semibold">
        <KeyRound className="size-5 text-primary" />
        {t("vault.code.title")}
      </p>
      <p className="text-sm text-muted-foreground">{t("vault.code.lead")}</p>

      <ol className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-3">
        {words.map((word, index) => (
          <li key={`${index}-${word}`} className="flex gap-2 tabular-nums">
            <span className="w-5 shrink-0 text-right text-muted-foreground">{index + 1}.</span>
            <span className="font-medium">{word}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard?.writeText(code);
            setCopied(true);
          }}
        >
          {copied ? t("vault.code.copied") : t("vault.code.copy")}
        </Button>
        <Button type="button" onClick={onDone}>
          {t("vault.code.next")}
        </Button>
      </div>

      <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        {t("vault.code.warning")}
      </p>
    </div>
  );
}
