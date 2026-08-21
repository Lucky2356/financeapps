"use client";

import { useI18n } from "@/lib/i18n/context";

/**
 * The cover block of a printed report — invisible on screen, first thing on
 * paper. A printout used to start mid-sentence with whatever card happened to
 * be at the top of the page, with nothing saying what it was, whose it was or
 * when it was made.
 */
export function PrintHeader({
  titleKey,
  period
}: {
  /** What this report is — "Финансовый отчёт", "Аналитика", … */
  titleKey: string;
  /** The period it covers, already formatted; omitted when it is everything. */
  period?: string;
}) {
  const { t, locale } = useI18n();
  const generated = new Date().toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  return (
    <div className="print-only hidden border-b-2 border-primary pb-3">
      <p className="text-[10pt] font-semibold uppercase tracking-[0.18em] text-primary">
        {t("shell.appName")}
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        <h1 className="text-[19pt] font-semibold leading-tight">{t(titleKey)}</h1>
        {period ? <p className="text-[10pt] text-muted-foreground">{period}</p> : null}
      </div>
      <p className="mt-1 text-[9pt] text-muted-foreground">
        {t("rep.generated", { date: generated })}
      </p>
    </div>
  );
}
