"use client";

import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/lib/i18n/context";
import type { RecommendationView } from "@/types/finance";

const iconBySeverity = {
  INFO: Info,
  SUCCESS: CheckCircle2,
  WARNING: TriangleAlert,
  CRITICAL: AlertCircle
};

const badgeBySeverity = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  CRITICAL: "destructive"
} as const;

export function RecommendationList({
  title,
  titleKey,
  items,
  empty
}: {
  title?: string;
  titleKey?: string;
  items: RecommendationView[];
  empty?: string;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titleKey ? t(titleKey) : title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={Info}
            title={t("common.empty")}
            description={empty ?? t("reco.empty")}
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = iconBySeverity[item.severity];
              return (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{item.title}</h3>
                        <Badge variant={badgeBySeverity[item.severity]}>{item.severity}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
