"use client";

// Избранные траты — кнопки «Кофе · 250 ₽» в быстром добавлении.
//
// Касание записывает трату сразу, сегодняшним числом, и закрывает окно; в
// сообщении — «Отменить», если промахнулись пальцем. Подержать палец (или
// правая кнопка мыши) — закрепить или убрать из избранного.

import { Pin, PinOff, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import type { TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { readMine, writeMine } from "@/lib/storage/mine";
import {
  sameKey,
  suggestFavorites,
  type Favorite,
  type FavoritePrefs
} from "@/lib/transactions/favorites";

export const FAVORITES_KEY = "quick-favorites";

export function readFavoritePrefs(): FavoritePrefs {
  try {
    const raw = readMine(FAVORITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<FavoritePrefs>) : {};
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : []
    };
  } catch {
    return { pinned: [], hidden: [] };
  }
}

export function writeFavoritePrefs(prefs: FavoritePrefs) {
  try {
    writeMine(FAVORITES_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function FavoriteChips({
  type,
  accountId,
  onRecorded
}: {
  type: "INCOME" | "EXPENSE";
  /** Счёт, выбранный в форме: кнопка пишет на него, а не на «свой». */
  accountId?: string;
  onRecorded: () => void;
}) {
  const { t } = useI18n();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [menu, setMenu] = useState<Favorite | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const since = formatInputDate(new Date(Date.now() - 60 * 86_400_000));
    const ledger = await apiClient
      .get<TransactionsPageData>(`/transactions?from=${since}&limit=all`)
      .catch(() => null);
    if (!ledger) return;
    setFavorites(
      suggestFavorites(
        ledger.transactions.map((row) => ({
          type: row.type === "INCOME" ? "INCOME" : "EXPENSE",
          date: row.date,
          amount: row.amount,
          description: row.description,
          categoryId: row.category.id,
          categoryLabel: row.category.label,
          color: row.category.color,
          accountId: row.account.id,
          transferId: row.transferId ?? null,
          splitGroupId: row.splitGroupId ?? null
        })),
        readFavoritePrefs()
      )
    );
  }

  useEffect(() => {
    // На микрозадачу, а не прямо в эффекте: список ставится состоянием.
    void Promise.resolve().then(load);
  }, []);

  const shown = favorites.filter((item) => item.type === type);
  if (shown.length === 0) return null;

  async function record(item: Favorite) {
    setBusy(true);
    try {
      const created = await apiClient.post<{ id: string }>("/transactions", {
        type: item.type,
        accountId: accountId || item.accountId,
        categoryId: item.categoryId,
        amount: String(item.amount),
        date: formatInputDate(new Date()),
        description: item.description
      });
      toast.success(
        t("fav.recorded", { name: item.description, amount: formatCurrency(item.amount) }),
        {
          action: {
            label: t("fav.undo"),
            onClick: () =>
              void apiClient
                .delete(`/transactions?id=${encodeURIComponent(created.id)}`)
                .then(() => toast.success(t("fav.undone")))
                .catch(() => undefined)
          }
        }
      );
      onRecorded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    } finally {
      setBusy(false);
    }
  }

  function change(next: (prefs: FavoritePrefs) => FavoritePrefs) {
    writeFavoritePrefs(next(readFavoritePrefs()));
    setMenu(null);
    void load();
  }

  return (
    <div className="space-y-1.5" data-testid="favorite-chips">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Star className="size-3" />
        {t("fav.title")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-60"
            onClick={() => void record(item)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu(item);
            }}
          >
            {item.pinned ? <Pin className="size-3 text-primary" /> : null}
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color ?? "#64748b" }}
            />
            {item.description}
            <span className="tabular-nums text-muted-foreground">
              {formatCurrency(item.amount)}
            </span>
          </button>
        ))}
      </div>
      <Dialog open={menu !== null} onOpenChange={(open) => !open && setMenu(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{menu?.description}</DialogTitle>
            <DialogDescription>{menu ? formatCurrency(menu.amount) : ""}</DialogDescription>
          </DialogHeader>
          {menu ? (
            <div className="grid gap-2">
              {menu.pinned ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    change((prefs) => ({
                      ...prefs,
                      pinned: prefs.pinned.filter((item) => sameKey(item.key) !== menu.key)
                    }))
                  }
                >
                  <PinOff className="size-4" />
                  {t("fav.unpin")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    change((prefs) => ({
                      ...prefs,
                      pinned: [
                        ...prefs.pinned,
                        {
                          key: menu.key,
                          type: menu.type,
                          description: menu.description,
                          amount: menu.amount,
                          categoryId: menu.categoryId,
                          categoryLabel: menu.categoryLabel,
                          color: menu.color,
                          accountId: menu.accountId
                        }
                      ]
                    }))
                  }
                >
                  <Pin className="size-4" />
                  {t("fav.pin")}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  change((prefs) => ({
                    pinned: prefs.pinned.filter((item) => sameKey(item.key) !== menu.key),
                    hidden: [...prefs.hidden, menu.key]
                  }))
                }
              >
                <X className="size-4" />
                {t("fav.hide")}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
