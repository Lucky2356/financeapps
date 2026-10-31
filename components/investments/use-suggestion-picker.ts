"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { useApiMutation } from "@/hooks/use-api-mutation";
import { apiClient } from "@/lib/api/client";
import type { useI18n } from "@/lib/i18n/context";
import {
  InvestmentSuggestionService,
  type InvestmentSuggestion
} from "@/services/InvestmentSuggestionService";
import type { InvestmentData } from "@/types/finance";

export const RISK_CODES = [
  { value: "CONSERVATIVE" },
  { value: "MODERATE" },
  { value: "AGGRESSIVE" }
] as const;
export type RiskCode = (typeof RISK_CODES)[number]["value"];

/**
 * Подборщик бумаг под бюджет. Состояние живёт у экрана, а не у вкладки
 * «Рынок»: подборка переживает переход на другую вкладку и обратно.
 */
export function useSuggestionPicker({
  data,
  locale,
  run,
  t,
  refresh
}: {
  data: InvestmentData;
  locale: ReturnType<typeof useI18n>["locale"];
  run: ReturnType<typeof useApiMutation>["run"];
  t: ReturnType<typeof useI18n>["t"];
  refresh: () => Promise<void>;
}) {
  // Suggestion engine inputs
  const [budget, setBudget] = useState("");
  const [riskCode, setRiskCode] = useState<RiskCode>("MODERATE");
  const [suggestions, setSuggestions] = useState<InvestmentSuggestion[]>([]);
  const [suggested, setSuggested] = useState(false);

  function computeSuggestions() {
    const value = Number(budget);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(t("inv.toast.enterBudget"));
      return;
    }
    const result = new InvestmentSuggestionService().suggest({
      budget: value,
      riskProfile: riskCode,
      portfolio: data.portfolio,
      securities: data.securities,
      locale
    });
    setSuggestions(result);
    setSuggested(true);
    if (result.length === 0) {
      toast.info(t("inv.toast.noMatch"));
    }
  }

  async function addSuggestion(suggestion: InvestmentSuggestion) {
    await run(
      () =>
        // Докупка, а не замена: бумага из подборки может уже лежать в портфеле.
        apiClient.post("/investments", {
          action: "addLot",
          ticker: suggestion.ticker,
          quantity: String(suggestion.suggestedQuantity),
          price: String(suggestion.price)
        }),
      {
        success: t("inv.toast.added", {
          ticker: suggestion.ticker,
          n: suggestion.suggestedQuantity
        }),
        error: t("inv.toast.addError"),
        onSuccess: async () => {
          setSuggestions((prev) => prev.filter((item) => item.ticker !== suggestion.ticker));
          await refresh();
        }
      }
    );
  }

  // Вся подборка разом — каждой бумагой как докупкой, как и по одной.
  async function addAllSuggestions() {
    const picked = [...suggestions];
    await run(
      async () => {
        for (const suggestion of picked) {
          await apiClient.post("/investments", {
            action: "addLot",
            ticker: suggestion.ticker,
            quantity: String(suggestion.suggestedQuantity),
            price: String(suggestion.price)
          });
        }
      },
      {
        success: t("inv.pick.addedAll", { count: picked.length }),
        error: t("inv.toast.addError"),
        onSuccess: async () => {
          setSuggestions([]);
          await refresh();
        }
      }
    );
  }

  return {
    budget,
    setBudget,
    riskCode,
    setRiskCode,
    suggestions,
    suggested,
    computeSuggestions,
    addSuggestion,
    addAllSuggestions
  };
}

export type SuggestionPickerState = ReturnType<typeof useSuggestionPicker>;
