"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { SecuritySearch } from "@/components/investments/security-search";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field-label";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { isUsableLot, summarizeLots } from "@/lib/investments/lots";
import { MARKET_SECTORS, sectorLabel } from "@/lib/market/sectors";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { InvestmentData } from "@/types/finance";

// A purchase row while it is being typed: the numbers stay strings so a
// half-entered "1." does not fight the input on every keystroke.
type LotDraft = { date: string; quantity: string; price: string };

export function PositionDialog({
  title,
  description,
  position,
  currency,
  owned,
  onSubmit
}: {
  title: string;
  description: string;
  data: InvestmentData;
  position?: InvestmentData["portfolio"][number];
  currency: string;
  owned: Array<{ ticker: string; name: string }>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t, locale } = useI18n();
  // For a new position the user can pick ANY security listed on MOEX via live
  // search; when editing, the ticker is fixed.
  const [chosen, setChosen] = useState<{ ticker: string; name: string } | null>(null);
  const ticker = position?.ticker ?? chosen?.ticker;

  // Two ways to state what a position cost. "По покупкам" is the default: the
  // user lists what they actually bought and the app derives the weighted
  // average. A position saved before this existed opens in "средняя вручную",
  // so its typed-in average is not silently thrown away.
  const [byLots, setByLots] = useState(!position || (position.lots?.length ?? 0) > 0);
  const [lots, setLots] = useState<LotDraft[]>(() =>
    position?.lots?.length
      ? position.lots.map((lot) => ({
          date: lot.date,
          quantity: String(lot.quantity),
          price: String(lot.price)
        }))
      : [{ date: formatInputDate(new Date()), quantity: "", price: "" }]
  );

  // Pre-filled with whatever the position is filed under today; the list also
  // carries that value when it came from somewhere else (a bond, a fund), so
  // opening the dialog never silently reclassifies a holding.
  const [sector, setSector] = useState(position?.sector ?? "");
  const sectorOptions = [...new Set([...(sector ? [sector] : []), ...MARKET_SECTORS])];

  const parsedLots = lots.map((lot) => ({
    date: lot.date,
    quantity: Number(lot.quantity),
    price: Number(lot.price)
  }));
  const summary = summarizeLots(parsedLots);
  const usableLots = parsedLots.filter((lot) => lot.date !== "" && isUsableLot(lot));

  function updateLot(index: number, patch: Partial<LotDraft>) {
    setLots((prev) => prev.map((lot, i) => (i === index ? { ...lot, ...patch } : lot)));
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="space-y-2">
          <Label>{t("inv.security")}</Label>
          {ticker ? <input type="hidden" name="ticker" value={ticker} /> : null}
          {position ? (
            <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
              {position.ticker}
            </div>
          ) : chosen ? (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{chosen.ticker}</span>{" "}
                <span className="text-muted-foreground">{chosen.name}</span>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(null)}>
                {t("common.edit")}
              </Button>
            </div>
          ) : (
            <SecuritySearch
              currency={currency}
              owned={owned}
              onSelect={(s) => setChosen({ ticker: s.ticker, name: s.name })}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1">
          {[
            { id: "lots", label: t("inv.lots.mode.lots") },
            { id: "manual", label: t("inv.lots.mode.manual") }
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setByLots(mode.id === "lots")}
              className={cn(
                "min-w-0 grow basis-[calc(50%-0.125rem)] rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                byLots === (mode.id === "lots")
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {byLots ? (
          <div className="space-y-2">
            {/* The list is submitted as one JSON field; the server recomputes the
                average from it so the stored figure can never drift from the
                purchases it is supposed to summarize. */}
            <input type="hidden" name="lots" value={JSON.stringify(usableLots)} />
            <FieldLabel help={t("help.inv.lots")}>{t("inv.lots.title")}</FieldLabel>
            {lots.map((lot, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[8rem] grow basis-[calc(50%-0.25rem)] space-y-1">
                  <span className="text-xs text-muted-foreground">{t("inv.lots.date")}</span>
                  <Input
                    type="date"
                    value={lot.date}
                    onChange={(event) => updateLot(index, { date: event.target.value })}
                  />
                </div>
                <div className="min-w-[6rem] grow basis-[calc(25%-0.25rem)] space-y-1">
                  <span className="text-xs text-muted-foreground">{t("inv.quantity")}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.000001"
                    inputMode="decimal"
                    value={lot.quantity}
                    onChange={(event) => updateLot(index, { quantity: event.target.value })}
                  />
                </div>
                <div className="min-w-[6rem] grow basis-[calc(25%-0.25rem)] space-y-1">
                  <span className="text-xs text-muted-foreground">{t("inv.lots.price")}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    inputMode="decimal"
                    value={lot.price}
                    onChange={(event) => updateLot(index, { price: event.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("inv.lots.remove")}
                  disabled={lots.length === 1}
                  onClick={() => setLots((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLots((prev) => [
                  ...prev,
                  { date: formatInputDate(new Date()), quantity: "", price: "" }
                ])
              }
            >
              <Plus className="size-3.5" />
              {t("inv.lots.add")}
            </Button>
            <p className="text-sm">
              {usableLots.length === 0 ? (
                <span className="text-muted-foreground">{t("inv.lots.empty")}</span>
              ) : (
                <span className="font-medium tabular-nums">
                  {t("inv.lots.summary", {
                    n: summary.quantity,
                    avg: formatCurrency(summary.averageBuyPrice, currency),
                    total: formatCurrency(summary.totalCost, currency)
                  })}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{t("inv.lots.hint")}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pos-quantity">{t("inv.quantity")}</Label>
              <Input
                id="pos-quantity"
                name="quantity"
                type="number"
                min="0"
                step="0.000001"
                inputMode="decimal"
                defaultValue={position?.quantity ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="pos-avg-price" help={t("help.inv.avgPrice")}>
                {t("inv.avgPrice")}
              </FieldLabel>
              <Input
                id="pos-avg-price"
                name="averageBuyPrice"
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                defaultValue={position?.averageBuyPrice ?? ""}
                required
              />
            </div>
          </div>
        )}
        {/* The market feed carries no industry, so the app fills it in from its
            own table of liquid tickers. Anything it does not know — a bond, a
            fresh listing — is the owner's to file, and what they choose wins. */}
        <div className="space-y-2">
          <FieldLabel htmlFor="pos-sector" help={t("help.inv.sector")}>
            {t("inv.col.sector")}
          </FieldLabel>
          <input type="hidden" name="sector" value={sector} />
          <Select value={sector} onValueChange={setSector}>
            <SelectTrigger id="pos-sector">
              <SelectValue placeholder={t("inv.sectorPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {sectorOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {sectorLabel(option, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-info/30 bg-info/12 p-3 text-sm text-muted-foreground">
          {t("inv.positionNote")}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={byLots && usableLots.length === 0}>
            {t("inv.savePosition")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
