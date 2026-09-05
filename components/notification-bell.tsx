"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { SEVERITY_STYLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { buildNotifications, countUrgent, type NotificationItem } from "@/lib/notifications";
import type { BudgetsPageData } from "@/lib/data";
import type { DashboardData, ForecastData } from "@/types/finance";

const badgeVariant = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  CRITICAL: "destructive"
} as const;

// Ids the user has already seen, so the badge goes quiet after opening the list
// and lights up again only for genuinely new notifications.
const READ_KEY = "notif-read";

function loadRead(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function NotificationBell() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = loadRead();
    if (stored.length > 0) void Promise.resolve().then(() => setReadIds(stored));
  }, []);

  // Called when the dialog opens: everything currently listed counts as seen.
  function markAllRead(currentItems: NotificationItem[]) {
    const ids = currentItems.map((item) => item.id);
    setReadIds(ids);
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(ids));
    } catch {
      /* storage unavailable — badge just won't persist as read */
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Pull from all three sources; each is best-effort so one failure does
      // not blank out the others.
      const [dashboard, forecast, budgets] = await Promise.all([
        apiClient.get<Pick<DashboardData, "recommendations">>("/dashboard").catch(() => null),
        apiClient
          .get<Pick<ForecastData, "upcomingEvents" | "warnings" | "currency">>("/forecast")
          .catch(() => null),
        apiClient.get<BudgetsPageData>("/budgets").catch(() => null)
      ]);
      if (cancelled) return;
      setItems(
        buildNotifications({
          recommendations: dashboard?.recommendations,
          upcomingEvents: forecast?.upcomingEvents,
          forecastWarnings: forecast?.warnings,
          budgets: budgets?.budgets,
          currency: forecast?.currency ?? budgets?.currency,
          locale
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // Only unseen urgent items light the badge.
  const unreadItems = items.filter((item) => !readIds.includes(item.id));
  const urgentCount = countUrgent(unreadItems);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) markAllRead(items);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            urgentCount > 0 ? t("notif.ariaSome", { count: urgentCount }) : t("notif.title")
          }
        >
          <Bell className="size-5" />
          {urgentCount > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {urgentCount > 9 ? "9+" : urgentCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("notif.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("notif.empty")}</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={cn("rounded-lg border p-3", SEVERITY_STYLES[item.severity])}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug">{item.title}</p>
                  <Badge variant={badgeVariant[item.severity]} className="shrink-0 text-[11px]">
                    {t(`notifSev.${item.severity}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs opacity-80">{item.description}</p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
