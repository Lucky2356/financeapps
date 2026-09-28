"use client";

// «Поездки»: бюджет, сколько ушло и на что, сколько можно в день до конца.

import { Pencil, Plane, Plus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useExtrasText } from "@/components/extras/extras-text";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import type { TripsPageData } from "@/lib/api/local/extras";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { formatCurrency } from "@/lib/format";
import type { TripView } from "@/lib/trips/trips";
import { cn } from "@/lib/utils";

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
};

export function TripsScreen() {
  const { words, format, locale } = useExtrasText();
  const { data, reload } = useApiPageData<TripsPageData>({ trips: [], active: null }, "/trips");
  const [editing, setEditing] = useState<Partial<TripView> | null>(null);
  const confirm = useConfirm();

  const date = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "short"
    });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await apiClient.post("/trips", { ...form, id: editing?.id });
      toast.success(words.trSaved);
      setEditing(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function remove(trip: TripView) {
    const ok = await confirm({
      title: words.trRemove,
      description: words.trRemoveHint,
      confirmLabel: words.trRemove
    });
    if (!ok) return;
    await apiClient.post("/trips", { action: "remove", id: trip.id });
    setEditing(null);
    await reload();
  }

  async function finish(trip: TripView) {
    await apiClient.post("/trips", { action: "finish", id: trip.id, today: today() });
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ from: today(), to: today(), currency: "RUB" })}>
          <Plus className="size-4" />
          {words.trAdd}
        </Button>
      </div>

      {data.trips.length === 0 ? (
        <EmptyState icon={Plane} title={words.trNone} description={words.trNoneHint} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.trips.map((trip) => {
            const money = (value: number) => formatCurrency(value, trip.currency);
            const share = trip.budget > 0 ? Math.min((trip.spent / trip.budget) * 100, 100) : 0;
            const over = trip.left !== null && trip.left < 0;
            return (
              <Card key={trip.id} data-testid="trip-card">
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{trip.name}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {date(trip.from)} — {date(trip.to)} ·{" "}
                      {format(words.trDays, { days: trip.days })} ·{" "}
                      <span className={cn(trip.active && "font-medium text-primary")}>
                        {trip.active ? words.trActive : trip.finished ? words.trDone : words.trSoon}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-2 -mt-1 size-8"
                    aria-label={words.trEdit}
                    onClick={() => setEditing(trip)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="font-semibold tabular-nums">
                    {trip.budget > 0
                      ? format(words.trSpent, {
                          spent: money(trip.spent),
                          budget: money(trip.budget)
                        })
                      : format(words.trSpentNoBudget, { spent: money(trip.spent) })}
                  </p>
                  {trip.budget > 0 ? (
                    <Progress
                      value={share}
                      indicatorClassName={over ? "bg-destructive" : undefined}
                    />
                  ) : null}
                  {over ? (
                    <p className="text-destructive">
                      {format(words.trOver, { amount: money(-(trip.left ?? 0)) })}
                    </p>
                  ) : trip.active && trip.left !== null ? (
                    <p className="text-muted-foreground">
                      {format(words.trLeft, { left: money(trip.left), days: trip.daysLeft })} ·{" "}
                      <span className="font-medium text-foreground">
                        {format(words.trPerDay, { amount: money(trip.perDayLeft ?? 0) })}
                      </span>
                    </p>
                  ) : null}
                  {trip.byCategory.length > 0 ? (
                    <ul className="space-y-1">
                      {trip.byCategory.slice(0, 5).map((row) => (
                        <li
                          key={row.categoryId}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: row.color ?? "#64748b" }}
                            />
                            <span className="truncate">{row.category}</span>
                          </span>
                          <span className="shrink-0 tabular-nums">{money(row.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {trip.operations > 0 ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/transactions?tag=${encodeURIComponent(trip.tag)}`}>
                          {words.trOps}
                        </Link>
                      </Button>
                    ) : null}
                    {trip.active ? (
                      <Button size="sm" variant="ghost" onClick={() => void finish(trip)}>
                        {words.trFinish}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? words.trEdit : words.trAdd}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form onSubmit={(event) => void save(event)} className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="trip-name">{words.trName}</Label>
                <Input id="trip-name" name="name" required defaultValue={editing.name ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="trip-from">{words.trFrom}</Label>
                  <Input
                    id="trip-from"
                    name="from"
                    type="date"
                    required
                    defaultValue={editing.from}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trip-to">{words.trTo}</Label>
                  <Input id="trip-to" name="to" type="date" required defaultValue={editing.to} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="trip-budget">{words.trBudget}</Label>
                  <Input
                    id="trip-budget"
                    name="budget"
                    inputMode="decimal"
                    defaultValue={editing.budget || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{words.trCurrency}</Label>
                  <Select name="currency" defaultValue={editing.currency ?? "RUB"}>
                    <SelectTrigger aria-label={words.trCurrency}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="gap-2">
                {editing.id ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => void remove(editing as TripView)}
                  >
                    {words.trRemove}
                  </Button>
                ) : null}
                <Button type="submit">{words.trSave}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
