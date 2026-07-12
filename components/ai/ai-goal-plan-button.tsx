"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { isLocalDesktopMode } from "@/lib/platform/env";
import type { AnalyticsData } from "@/lib/data";
import type { AiProvider } from "@/lib/ai/models";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type GoalLike = {
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
};

// Per-goal "AI plan" button: proposes a realistic savings plan for one goal.
// Renders only when the AI assistant is enabled (Settings → AI).
export function AiGoalPlanButton({ goal, currency }: { goal: GoalLike; currency: string }) {
  const { t, locale } = useI18n();
  const settings = useAiSettings();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!settings?.aiEnabled) return null;

  async function generate() {
    setOpen(true);
    setPlan(null);

    let freeCashflow = 0;
    try {
      const analytics = await apiClient.get<AnalyticsData>("/analytics");
      freeCashflow = Math.round(analytics.avgMonthlyIncome - analytics.avgMonthlyExpense);
    } catch {
      /* fall back to 0 free cashflow */
    }

    const payload = {
      title: goal.title,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      deadline: goal.deadline ? goal.deadline.slice(0, 10) : "",
      monthlyFreeCashflow: freeCashflow,
      currency
    };

    try {
      setLoading(true);
      let result: string;
      if (isLocalDesktopMode) {
        const apiKey = settings?.aiApiKey ?? "";
        if (!apiKey) {
          toast.error(t("ai.err.noKey"));
          return;
        }
        const { requestGoalPlan } = await import("@/services/ai/AiAssistantService");
        result = await requestGoalPlan({
          goal: payload,
          locale: locale === "en" ? "en" : "ru",
          apiKey,
          model: settings?.aiModel || undefined,
          provider: (settings?.aiProvider as AiProvider) || undefined,
          effort: settings?.aiEffort || undefined
        });
      } else {
        const res = await apiClient.post<{ answer: string }>("/ai/goal-plan", {
          goal: payload,
          locale
        });
        result = res.answer;
      }
      setPlan(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aiq.err.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title={t("aigoal.title")}
        aria-label={t("aigoal.title")}
        onClick={() => void generate()}
      >
        <Sparkles className="size-4 text-primary" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("aigoal.dialogTitle", { title: goal.title })}</DialogTitle>
            <DialogDescription>{t("aigoal.dialogDesc")}</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("aigoal.loading")}
            </div>
          ) : plan ? (
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm leading-relaxed">
              {plan}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
