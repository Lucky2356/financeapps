"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { isLocalDesktopMode } from "@/lib/platform/env";
import type { AnalyticsData } from "@/lib/data";
import type { AiProvider } from "@/lib/ai/models";
import type { BudgetSuggestion, BudgetCategoryInput } from "@/lib/ai/budget-plan";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// AI budget planner: proposes monthly limits per expense category from the recent
// average spend, previews them, and applies them to the current month's budgets.
// Renders only when the AI assistant is enabled (Settings → AI).
export function AiBudgetPlanCard() {
  const { t, locale } = useI18n();
  const settings = useAiSettings();
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState("RUB");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  if (!settings?.aiEnabled) return null;

  async function generate() {
    let analytics: AnalyticsData;
    try {
      analytics = await apiClient.get<AnalyticsData>("/analytics");
    } catch {
      return toast.error(t("aiq.err.loadData"));
    }
    const months = Math.max(1, analytics.monthlyCashflow.length);
    const categories: BudgetCategoryInput[] = analytics.topExpenseCategories.map((c) => ({
      categoryId: c.categoryId,
      label: c.category,
      avgMonthly: c.total / months
    }));
    if (categories.length === 0) return toast.info(t("aibudget.noData"));
    setLabels(Object.fromEntries(categories.map((c) => [c.categoryId, c.label])));
    setCurrency(analytics.currency || "RUB");

    try {
      setLoading(true);
      setSuggestions(null);
      let result: BudgetSuggestion[];
      if (isLocalDesktopMode) {
        const apiKey = settings?.aiApiKey ?? "";
        if (!apiKey) {
          toast.error(t("ai.err.noKey"));
          return;
        }
        const { requestBudgetPlan } = await import("@/services/ai/AiAssistantService");
        result = await requestBudgetPlan({
          categories,
          avgMonthlyIncome: analytics.avgMonthlyIncome,
          currency: analytics.currency || "RUB",
          locale: locale === "en" ? "en" : "ru",
          apiKey,
          model: settings?.aiModel || undefined,
          provider: (settings?.aiProvider as AiProvider) || undefined,
          effort: settings?.aiEffort || undefined
        });
      } else {
        const res = await apiClient.post<{ suggestions: BudgetSuggestion[] }>("/ai/budgets", {
          categories,
          avgMonthlyIncome: analytics.avgMonthlyIncome,
          currency: analytics.currency || "RUB",
          locale
        });
        result = res.suggestions;
      }
      if (result.length === 0) return toast.info(t("aibudget.empty"));
      setSuggestions(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aiq.err.failed"));
    } finally {
      setLoading(false);
    }
  }

  async function applyAll() {
    if (!suggestions || suggestions.length === 0) return;
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM (current)
    setApplying(true);
    let applied = 0;
    for (const s of suggestions) {
      try {
        await apiClient.post("/budgets", {
          categoryId: s.categoryId,
          limitAmount: String(s.limit),
          month
        });
        applied += 1;
      } catch {
        /* skip this one */
      }
    }
    setApplying(false);
    toast.success(t("aibudget.applied", { applied }));
    // Reload so the budget list reflects the new limits.
    await new Promise((r) => setTimeout(r, 300));
    window.location.reload();
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          {t("aibudget.title")}
        </CardTitle>
        <Button type="button" size="sm" onClick={() => void generate()} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {t("aibudget.suggest")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!suggestions ? (
          <p className="text-sm text-muted-foreground">{t("aibudget.hint")}</p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {suggestions.map((s) => (
                <li key={s.categoryId} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{labels[s.categoryId] ?? s.categoryId}</p>
                    {s.rationale ? (
                      <p className="text-xs text-muted-foreground">{s.rationale}</p>
                    ) : null}
                  </div>
                  <span className="num shrink-0 text-sm font-semibold">
                    {formatCurrency(s.limit, currency)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => void applyAll()} disabled={applying}>
                {applying ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("aibudget.apply")}
              </Button>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">{t("aiq.footer")}</p>
      </CardContent>
    </Card>
  );
}
