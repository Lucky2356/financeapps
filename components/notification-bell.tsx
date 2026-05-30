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
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DashboardData, RecommendationView } from "@/types/finance";

const severityLabel: Record<RecommendationView["severity"], string> = {
  INFO: "Инфо",
  SUCCESS: "Ок",
  WARNING: "Важно",
  CRITICAL: "Срочно",
};

const badgeVariant = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  CRITICAL: "destructive",
} as const;

export function NotificationBell() {
  const [recommendations, setRecommendations] = useState<RecommendationView[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Pick<DashboardData, "recommendations">>("/dashboard")
      .then((data) => {
        if (!cancelled) setRecommendations(data.recommendations ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const urgentCount = recommendations.filter(
    (r) => r.severity === "WARNING" || r.severity === "CRITICAL"
  ).length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={urgentCount > 0 ? `${urgentCount} важных уведомлений` : "Уведомления"}
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
          <DialogTitle>Рекомендации и предупреждения</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {recommendations.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Нет активных рекомендаций
            </p>
          ) : (
            recommendations.map((item) => (
              <div
                key={item.id}
                className={cn("rounded-lg border p-3", SEVERITY_STYLES[item.severity])}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug">{item.title}</p>
                  <Badge variant={badgeVariant[item.severity]} className="shrink-0 text-[11px]">
                    {severityLabel[item.severity]}
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
