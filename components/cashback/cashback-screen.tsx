"use client";

// «Кэшбэк»: условия карт на месяц, итог — пришло и упущено.

import { ChevronLeft, ChevronRight, Copy, Percent, Plus, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { monthLabel } from "@/components/sheet/sheet-text";
import { shiftMonth, useExtrasText } from "@/components/extras/extras-text";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import type { CashbackPageData } from "@/lib/api/local/extras";
import { ANY_CATEGORY, type CashbackRule } from "@/lib/cashback/cashback";
import type { AccountsPageData, CategoriesPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";

const thisMonth = () => new Date().toISOString().slice(0, 7);

const EMPTY: CashbackPageData = {
  month: "",
  rules: [],
  summary: { earned: 0, missed: 0, byAccount: [], missedTop: [] },
  previousHasRules: false
};

export function CashbackScreen() {
  const { words, format, locale } = useExtrasText();
  const [month, setMonth] = useState(thisMonth);
  const { data, reload } = useApiPageData<CashbackPageData>(EMPTY, `/cashback?month=${month}`);
  const { data: accountsData } = useApiPageData<AccountsPageData>(
    { source: "database", accounts: [], totalBalance: 0, currency: "RUB" },
    "/accounts"
  );
  const { data: categoriesData } = useApiPageData<CategoriesPageData>(
    { source: "database", categories: [] },
    "/categories"
  );
  const [editing, setEditing] = useState<Partial<CashbackRule> | null>(null);

  const accounts = accountsData.accounts.filter(
    (account) => !(account as { isArchived?: boolean }).isArchived
  );
  const cards = accounts.filter((account) => account.type !== "BROKERAGE");
  const categories = categoriesData.categories.filter((category) => category.kind === "EXPENSE");
  const accountName = (id: string) => accounts.find((item) => item.id === id)?.name ?? "—";
  const categoryName = (id: string) =>
    id === ANY_CATEGORY ? words.cbAny : (categories.find((item) => item.id === id)?.name ?? "—");
  const money = (value: number) => formatCurrency(value);

  const byCard = useMemo(() => {
    const groups = new Map<string, CashbackRule[]>();
    for (const rule of data.rules) {
      groups.set(rule.accountId, [...(groups.get(rule.accountId) ?? []), rule]);
    }
    for (const list of groups.values())
      list.sort((a, b) =>
        a.categoryId === ANY_CATEGORY
          ? 1
          : b.categoryId === ANY_CATEGORY
            ? -1
            : b.percent - a.percent
      );
    return [...groups.entries()];
  }, [data.rules]);

  async function copyPrevious() {
    try {
      const result = await apiClient.post<{ copied: number }>("/cashback", {
        action: "copyPrevious",
        month
      });
      toast.success(format(words.cbCopied, { count: result?.copied ?? 0 }));
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function remove(id: string) {
    await apiClient.post("/cashback", { action: "remove", id });
    await reload();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await apiClient.post("/cashback", { ...form, id: editing?.id, month });
      toast.success(words.cbSaved);
      setEditing(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={words.prevMonth}
            onClick={() => setMonth((value) => shiftMonth(value, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-32 text-center font-semibold" data-testid="cashback-month">
            {monthLabel(month, locale, "long")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={words.nextMonth}
            onClick={() => setMonth((value) => shiftMonth(value, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.previousHasRules ? (
            <Button variant="outline" onClick={() => void copyPrevious()}>
              <Copy className="size-4" />
              {words.cbCopy}
            </Button>
          ) : null}
          <Button onClick={() => setEditing({})} disabled={cards.length === 0}>
            <Plus className="size-4" />
            {words.cbAdd}
          </Button>
        </div>
      </div>

      {data.rules.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{words.cbEarned}</p>
              <p
                className="text-2xl font-semibold tabular-nums text-success"
                data-testid="cb-earned"
              >
                {money(data.summary.earned)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{words.cbMissed}</p>
              <p className="text-2xl font-semibold tabular-nums" data-testid="cb-missed">
                {money(data.summary.missed)}
              </p>
              {data.summary.missedTop.slice(0, 2).map((miss) => (
                <p key={miss.categoryId} className="mt-1 text-xs text-muted-foreground">
                  {format(words.cbMissedHint, {
                    category: miss.category,
                    card: accountName(miss.bestAccountId),
                    amount: money(miss.amount)
                  })}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <EmptyState
          icon={Percent}
          title={words.cbNoRules}
          description={words.cbNoRulesHint}
          action={
            data.previousHasRules ? (
              <Button variant="outline" onClick={() => void copyPrevious()}>
                <Copy className="size-4" />
                {words.cbCopy}
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {byCard.map(([accountId, rules]) => (
          <Card key={accountId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{accountName(accountId)}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left hover:underline"
                      onClick={() => setEditing(rule)}
                    >
                      {categoryName(rule.categoryId)}
                    </button>
                    <span className="shrink-0 font-semibold tabular-nums">{rule.percent} %</span>
                    {rule.limit !== undefined ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {format(words.cbUpTo, { limit: money(rule.limit) })}
                      </span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={words.cbRemove}
                      onClick={() => void remove(rule.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{words.cbAdd}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form onSubmit={(event) => void save(event)} className="grid gap-4">
              <div className="space-y-2">
                <Label>{words.cbCard}</Label>
                <Select name="accountId" defaultValue={editing.accountId ?? cards[0]?.id}>
                  <SelectTrigger aria-label={words.cbCard}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{words.cbCategory}</Label>
                <Select name="categoryId" defaultValue={editing.categoryId ?? categories[0]?.id}>
                  <SelectTrigger aria-label={words.cbCategory}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_CATEGORY}>{words.cbAny}</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cb-percent">{words.cbPercent}</Label>
                  <Input
                    id="cb-percent"
                    name="percent"
                    inputMode="decimal"
                    required
                    defaultValue={editing.percent ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cb-limit">{words.cbLimit}</Label>
                  <Input
                    id="cb-limit"
                    name="limit"
                    inputMode="decimal"
                    defaultValue={editing.limit ?? ""}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">{words.cbLimitHint}</p>
              <DialogFooter>
                <Button type="submit">{words.cbSave}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
