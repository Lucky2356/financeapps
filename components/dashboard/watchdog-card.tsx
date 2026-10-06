"use client";

// «Стоит проверить» — то, что утекает незаметно (lib/analytics/watchdog.ts):
// подорожавшая подписка, двойное списание, кончающийся пробный период,
// необычно крупная трата. Каждую находку можно отметить «Всё верно» — и она
// больше не всплывёт. Нет находок — нет и карточки.

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { Finding } from "@/lib/analytics/watchdog";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { readMine, writeMine } from "@/lib/storage/mine";

export const WATCHDOG_DISMISSED_KEY = "watchdog-dismissed";

function readDismissed(): string[] {
  try {
    const raw = readMine(WATCHDOG_DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function WatchdogCard({ currency }: { currency: string }) {
  const { t, locale } = useI18n();
  const { data } = useApiPageData({ findings: [] }, "/watchdog");
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed());
  }, []);

  const findings = data.findings.filter((finding) => !dismissed.includes(finding.key));
  if (findings.length === 0) return null;

  const money = (value: number) => formatCurrency(value, currency);
  const date = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "long"
    });

  function text(finding: Finding): string {
    switch (finding.kind) {
      case "priceUp":
        return t("watch.priceUp", {
          name: finding.name,
          before: money(finding.before),
          now: money(finding.now)
        });
      case "duplicate":
        return t("watch.duplicate", {
          name: finding.name,
          amount: money(finding.amount),
          first: date(finding.dates[0]),
          second: date(finding.dates[1])
        });
      case "trial":
        return t("watch.trial", {
          name: finding.name,
          date: date(finding.ends),
          amount: money(finding.amount)
        });
      case "unusual":
        return t("watch.unusual", {
          name: finding.name,
          amount: money(finding.amount),
          category: finding.category,
          usual: money(finding.usual)
        });
    }
  }

  function href(finding: Finding): string {
    if (finding.kind === "trial") return "/recurring";
    const day = finding.kind === "duplicate" ? finding.dates[0] : finding.date;
    const to = finding.kind === "duplicate" ? finding.dates[1] : finding.date;
    return `/transactions?from=${day}&to=${to}&q=${encodeURIComponent(finding.name)}`;
  }

  function dismiss(key: string) {
    const next = [...readDismissed(), key].slice(-200);
    try {
      writeMine(WATCHDOG_DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setDismissed(next);
  }

  return (
    <Card data-testid="watchdog" className="border-warning/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="size-4 text-warning" />
          {t("watch.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {findings.slice(0, 5).map((finding) => (
            <li
              key={finding.key}
              className="flex flex-col gap-2 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{text(finding)}</span>
              <span className="flex shrink-0 gap-1">
                <Button asChild size="sm" variant="ghost">
                  <Link href={href(finding)}>{t("watch.open")}</Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => dismiss(finding.key)}
                >
                  {t("watch.ok")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
