"use client";

import { Plus } from "lucide-react";

import { InfoHint } from "@/components/info-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

import {
  RISK_CODES,
  type SuggestionPickerState
} from "@/components/investments/use-suggestion-picker";

const riskVariant = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "destructive"
} as const;

/** Picker (suggestions) — a helper to build a diversified portfolio. */
export function SuggestionPicker({
  picker,
  currency
}: {
  picker: SuggestionPickerState;
  currency: string;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {t("inv.suggestTitle")}
          <InfoHint text="tip.inv.suggestTitle" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("inv.suggestIntro")}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <FieldLabel htmlFor="invest-budget" help={t("help.inv.budget")}>
              {t("inv.budgetLabel")}
            </FieldLabel>
            <Input
              id="invest-budget"
              type="number"
              min="0"
              step="1000"
              value={picker.budget}
              onChange={(e) => picker.setBudget(e.target.value)}
              placeholder={t("inv.budgetPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="invest-risk" help={t("help.inv.risk")}>
              {t("inv.riskAllowed")}
            </FieldLabel>
            <Select
              value={picker.riskCode}
              onValueChange={(value) => picker.setRiskCode(value as typeof picker.riskCode)}
            >
              <SelectTrigger id="invest-risk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_CODES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(`riskProfile.${option.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={picker.computeSuggestions}>
            {t("inv.suggestBtn")}
          </Button>
        </div>

        {picker.suggested && picker.suggestions.length > 0 ? (
          <div className="space-y-2">
            {/* Итог подборки и «добавить всё» — одной строкой сверху:
                подбирали под бюджет, и первым делом хочется видеть,
                сколько это вместе. */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span>
                {t("inv.pick.total", {
                  amount: formatCurrency(
                    picker.suggestions.reduce((sum, item) => sum + item.suggestedAmount, 0),
                    currency
                  )
                })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void picker.addAllSuggestions()}
              >
                <Plus className="size-4" />
                {t("inv.pick.addAll")}
              </Button>
            </div>
            {picker.suggestions.map((suggestion) => (
              <div
                key={suggestion.ticker}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {suggestion.ticker} · {suggestion.name}
                    <Badge
                      variant={riskVariant[suggestion.risk]}
                      className="ml-2 align-middle text-[11px]"
                    >
                      {t(`riskLevel.${suggestion.risk}`)}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
                </div>
                <div className="flex items-center gap-3 sm:shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {t("inv.pieces", { n: suggestion.suggestedQuantity })} ·{" "}
                      {formatCurrency(suggestion.suggestedAmount, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("inv.atPrice", {
                        price: formatCurrency(suggestion.price, currency)
                      })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void picker.addSuggestion(suggestion)}
                  >
                    <Plus className="size-4" />
                    {t("inv.toPortfolio")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : picker.suggested ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t("inv.noSuggestions")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
