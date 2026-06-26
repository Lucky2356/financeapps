"use client";

import { ArrowRight, Check, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type {
  AccountsPageData,
  BudgetsPageData,
  GoalsPageData,
  ImportPageData,
  TransactionsPageData
} from "@/lib/data";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "setup-checklist-dismissed-v1";

type Counts = {
  accounts: number;
  transactions: number;
  budgets: number;
  goals: number;
  backupFresh: boolean;
};

// Tracks the first-setup progress from real data and guides the next action.
// Auto-hides once every step is done (or when dismissed).
export function SetupChecklist() {
  const router = useRouter();
  const { t } = useI18n();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  const loadCounts = useCallback(async () => {
    const [accounts, transactions, budgets, goals, importRefs] = await Promise.all([
      apiClient.get<AccountsPageData>("/accounts").catch(() => null),
      apiClient.get<TransactionsPageData>("/transactions").catch(() => null),
      apiClient.get<BudgetsPageData>("/budgets").catch(() => null),
      apiClient.get<GoalsPageData>("/goals").catch(() => null),
      apiClient.get<ImportPageData>("/import").catch(() => null)
    ]);
    setCounts({
      accounts: accounts?.accounts.length ?? 0,
      transactions: transactions?.pagination.total ?? transactions?.transactions.length ?? 0,
      budgets: budgets?.budgets.filter((b) => b.limitAmount > 0).length ?? 0,
      goals: goals?.goals.length ?? 0,
      backupFresh: importRefs?.backupReminderDue === false
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await loadCounts();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCounts]);

  async function loadSampleData() {
    setLoadingSample(true);
    try {
      await apiClient.post("/sample");
      toast.success(t("set.toast.sampleLoaded"));
      await loadCounts();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.toast.sampleError"));
    } finally {
      setLoadingSample(false);
    }
  }

  if (dismissed || !counts) return null;

  const steps = [
    {
      done: counts.accounts > 0,
      title: t("sc.s1.title"),
      desc: t("sc.s1.desc"),
      cta: t("sc.s1.cta"),
      href: "/accounts" as const
    },
    {
      done: counts.transactions > 0,
      title: t("sc.s2.title"),
      desc: t("sc.s2.desc"),
      action: "quick-add" as const
    },
    {
      done: counts.budgets > 0,
      title: t("sc.s3.title"),
      desc: t("sc.s3.desc"),
      cta: t("sc.s3.cta"),
      href: "/budgets" as const
    },
    {
      done: counts.goals > 0,
      title: t("sc.s4.title"),
      desc: t("sc.s4.desc"),
      cta: t("sc.s4.cta"),
      href: "/goals" as const
    },
    {
      done: counts.backupFresh,
      title: t("sc.s5.title"),
      desc: t("sc.s5.desc"),
      cta: t("sc.s5.cta"),
      href: "/import" as const
    }
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.06] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t("sc.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("sc.progress", { done: doneCount, total: steps.length })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {counts.accounts === 0 && counts.transactions === 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadSampleData()}
              disabled={loadingSample}
            >
              <Sparkles className="size-3.5" />
              {loadingSample ? t("set.data.loading") : t("set.data.loadSample")}
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={dismiss} aria-label={t("sc.dismiss")}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((step, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-card p-3 text-sm",
              step.done && "opacity-60"
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                step.done
                  ? "bg-success/20 text-success-foreground"
                  : "bg-primary text-primary-foreground"
              )}
            >
              {step.done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", step.done && "line-through")}>{step.title}</p>
              <p className="truncate text-xs text-muted-foreground">{step.desc}</p>
            </div>
            {!step.done ? (
              step.action === "quick-add" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.dispatchEvent(new Event("quick-add-open"))}
                >
                  <Plus className="size-3.5" />
                  {t("common.add")}
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={step.href}>
                    {step.cta}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              )
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
