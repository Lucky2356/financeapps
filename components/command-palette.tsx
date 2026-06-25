"use client";

import {
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  Download,
  LayoutDashboard,
  LineChart,
  PiggyBank,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Tags,
  TrendingUp,
  Wallet
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { AccountsPageData, CategoriesPageData, TransactionsPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";
import { formatCurrency } from "@/lib/format";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  // Either a literal label (for data like account names) or a catalog key.
  label?: string;
  labelKey?: string;
  hint?: string;
  href?: string;
  action?: () => void;
  group: string;
  icon: typeof Search;
};

const navCommands: Command[] = [
  { id: "nav-home", labelKey: "nav.home", href: "/", group: "nav", icon: LayoutDashboard },
  { id: "nav-tx", labelKey: "nav.transactions", href: "/transactions", group: "nav", icon: ReceiptText },
  { id: "nav-accounts", labelKey: "nav.accounts", href: "/accounts", group: "nav", icon: Wallet },
  { id: "nav-budgets", labelKey: "nav.budgets", href: "/budgets", group: "nav", icon: CreditCard },
  { id: "nav-goals", labelKey: "nav.goals", href: "/goals", group: "nav", icon: PiggyBank },
  { id: "nav-recurring", labelKey: "cmd.recurring", href: "/recurring", group: "nav", icon: CalendarClock },
  { id: "nav-forecast", labelKey: "nav.forecast", href: "/forecast", group: "nav", icon: TrendingUp },
  { id: "nav-analytics", labelKey: "nav.analytics", href: "/analytics", group: "nav", icon: BarChart3 },
  { id: "nav-investments", labelKey: "nav.investments", href: "/investments", group: "nav", icon: LineChart },
  { id: "nav-categories", labelKey: "nav.categories", href: "/categories", group: "nav", icon: Tags },
  { id: "nav-import", labelKey: "cmd.importExport", href: "/import", group: "nav", icon: Download },
  { id: "nav-settings", labelKey: "nav.settings", href: "/settings", group: "nav", icon: Settings }
];

export function CommandPalette() {
  const router = useRouter();
  const { t } = useI18n();
  const labelOf = useCallback(
    (command: Command) => (command.labelKey ? t(command.labelKey) : (command.label ?? "")),
    [t]
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dynamic, setDynamic] = useState<Command[]>([]);
  const [txResults, setTxResults] = useState<Command[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Global Ctrl/Cmd+K toggle. event.code is layout-independent (works on the
  // Russian keyboard layout too, where KeyK prints "л").
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyK") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const openHandler = () => setOpen(true);
    window.addEventListener("keydown", handler);
    window.addEventListener("command-palette-open", openHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("command-palette-open", openHandler);
    };
  }, []);

  // Load accounts and categories as searchable jump targets when opened.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [accounts, categories] = await Promise.all([
          apiClient.get<AccountsPageData>("/accounts"),
          apiClient.get<CategoriesPageData>("/categories")
        ]);
        if (cancelled) return;
        setDynamic([
          ...accounts.accounts.map((account) => ({
            id: `acc-${account.id}`,
            label: account.name,
            hint: t("cmd.account"),
            href: `/transactions?accountId=${encodeURIComponent(account.id)}`,
            group: "accounts",
            icon: Wallet
          })),
          ...categories.categories.map((category) => ({
            id: `cat-${category.id}`,
            label: category.name,
            hint: category.kind === "INCOME" ? t("cmd.incomeCategory") : t("cmd.expenseCategory"),
            href: `/transactions?categoryId=${encodeURIComponent(category.id)}${category.kind === "EXPENSE" ? "&type=EXPENSE" : ""}`,
            group: "categories",
            icon: Tags
          }))
        ]);
      } catch {
        /* offline / unavailable — navigation commands still work */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  // Search individual transactions by description/account/category once the user
  // types (debounced). Server-side `q` filter, so results are pre-matched.
  useEffect(() => {
    const q = query.trim();
    // Stale results are gated out of `filtered` by query length, so there is no
    // need to clear state synchronously here (avoids set-state-in-effect).
    if (!open || q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await apiClient.get<TransactionsPageData>(
            `/transactions?q=${encodeURIComponent(q)}&limit=6`
          );
          if (cancelled) return;
          setTxResults(
            data.transactions.map((tx) => ({
              id: `tx-${tx.id}`,
              label: tx.description || tx.category.label,
              hint: `${tx.type === "INCOME" ? "+" : "−"}${formatCurrency(tx.amount)} · ${tx.category.label}`,
              href: `/transactions?q=${encodeURIComponent(q)}`,
              group: "transactions",
              icon: ReceiptText
            }))
          );
        } catch {
          /* offline / unavailable — other results still work */
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const actionCommands: Command[] = useMemo(
    () => [
      {
        id: "act-add",
        labelKey: "cmd.addTransaction",
        hint: "Alt+N",
        action: () => window.dispatchEvent(new Event("quick-add-open")),
        group: "actions",
        icon: Plus
      }
    ],
    []
  );

  const filtered = useMemo(() => {
    const base = [...actionCommands, ...navCommands, ...dynamic];
    const q = query.trim().toLowerCase();
    if (!q) return base;
    // Transaction results are already matched server-side; append them after the
    // label-filtered navigation/account/category commands.
    const matchedBase = base.filter((command) => labelOf(command).toLowerCase().includes(q));
    // Transaction results only apply once the search is long enough to fetch them.
    return q.length >= 2 ? [...matchedBase, ...txResults] : matchedBase;
  }, [actionCommands, dynamic, query, txResults, labelOf]);

  // Reset highlight when the query changes (set-state-during-render pattern).
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setActiveIndex(0);
  }
  const safeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  function run(command: Command) {
    setOpen(false);
    setQuery("");
    if (command.action) command.action();
    else if (command.href) router.push(command.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = filtered[safeIndex];
      if (command) run(command);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Командная палитра</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("cmd.placeholder")}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("cmd.nothingFound")}</p>
          ) : (
            filtered.map((command, index) => {
              const Icon = command.icon;
              return (
                <button
                  key={command.id}
                  type="button"
                  onClick={() => run(command)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                    index === safeIndex ? "bg-primary/10 text-primary" : "text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-80" />
                  <span className="flex-1 truncate">{labelOf(command)}</span>
                  {command.hint ? <span className="shrink-0 text-xs text-muted-foreground">{command.hint}</span> : null}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CircleDollarSign className="size-3" />
            Финансовый помощник
          </span>
          <span>{t("cmd.footer")}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
