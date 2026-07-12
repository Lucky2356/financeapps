"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { buildFinanceSummary } from "@/lib/ai/finance-summary";
import { useI18n } from "@/lib/i18n/context";
import type { AnalyticsData, SettingsPageData } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// "Ask your finances": natural-language Q&A over a compact, pre-computed summary
// of the user's analytics. Renders only when the AI assistant is enabled
// (Settings → AI). Desktop calls the provider client-side with the user's key;
// web proxies through /api/ai/insights with the server key.
export function AiInsightPanel() {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState<SettingsPageData | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

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

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return toast.error(t("aiq.err.enterQuestion"));

    let analytics: AnalyticsData;
    try {
      analytics = await apiClient.get<AnalyticsData>("/analytics");
    } catch {
      return toast.error(t("aiq.err.loadData"));
    }
    const summary = buildFinanceSummary(analytics);

    try {
      setAsking(true);
      setAnswer(null);
      let result: string;
      if (isLocalDesktopMode) {
        const apiKey = settings?.aiApiKey ?? "";
        if (!apiKey) {
          toast.error(t("ai.err.noKey"));
          return;
        }
        const { requestFinancialAnswer } = await import("@/services/ai/AiAssistantService");
        result = await requestFinancialAnswer({
          question: trimmed,
          summary,
          locale: locale === "en" ? "en" : "ru",
          apiKey,
          model: settings?.aiModel || undefined,
          provider: (settings?.aiProvider as "anthropic" | "openai" | "deepseek") || undefined,
          effort: settings?.aiEffort || undefined
        });
      } else {
        const res = await apiClient.post<{ answer: string }>("/ai/insights", {
          question: trimmed,
          summary,
          locale
        });
        result = res.answer;
      }
      setAnswer(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aiq.err.failed"));
    } finally {
      setAsking(false);
    }
  }

  const examples = [t("aiq.example.1"), t("aiq.example.2"), t("aiq.example.3")];

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          {t("aiq.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("aiq.placeholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask(question);
            }}
          />
          <Button type="button" onClick={() => void ask(question)} disabled={asking}>
            {asking ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {t("aiq.ask")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuestion(ex);
                void ask(ex);
              }}
              disabled={asking}
              className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>

        {answer && (
          <div className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm leading-relaxed">
            {answer}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("aiq.footer")}</p>
      </CardContent>
    </Card>
  );
}
