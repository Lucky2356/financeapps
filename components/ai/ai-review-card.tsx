"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { buildFinanceSummary } from "@/lib/ai/finance-summary";
import type { AiProvider } from "@/lib/ai/models";
import { useI18n } from "@/lib/i18n/context";
import type { AnalyticsData, SettingsPageData } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// AI financial coach: a written review of the user's finances on demand. Renders
// only when the AI assistant is enabled (Settings → AI). Desktop calls the
// provider client-side with the user's key; web proxies through /api/ai/review.
export function AiReviewCard() {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState<SettingsPageData | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<SettingsPageData>("/settings")
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        /* settings unavailable — keep hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings?.aiEnabled) return null;

  async function generate() {
    let analytics: AnalyticsData;
    try {
      analytics = await apiClient.get<AnalyticsData>("/analytics");
    } catch {
      return toast.error(t("aiq.err.loadData"));
    }
    const summary = buildFinanceSummary(analytics);

    try {
      setLoading(true);
      setReview(null);
      let result: string;
      if (isLocalDesktopMode) {
        const apiKey = settings?.aiApiKey ?? "";
        if (!apiKey) {
          toast.error(t("ai.err.noKey"));
          return;
        }
        const { requestFinancialReview } = await import("@/services/ai/AiAssistantService");
        result = await requestFinancialReview({
          summary,
          locale: locale === "en" ? "en" : "ru",
          apiKey,
          model: settings?.aiModel || undefined,
          provider: (settings?.aiProvider as AiProvider) || undefined,
          effort: settings?.aiEffort || undefined
        });
      } else {
        const res = await apiClient.post<{ answer: string }>("/ai/review", {
          summary,
          locale
        });
        result = res.answer;
      }
      setReview(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aiq.err.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          {t("aireview.title")}
        </CardTitle>
        <Button type="button" size="sm" onClick={() => void generate()} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {t("aireview.generate")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {review ? (
          <div className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm leading-relaxed">
            {review}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("aireview.hint")}</p>
        )}
        <p className="text-xs text-muted-foreground">{t("aiq.footer")}</p>
      </CardContent>
    </Card>
  );
}
