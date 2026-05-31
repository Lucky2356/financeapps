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
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { AccountsPageData, CategoriesPageData } from "@/lib/data";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  label: string;
  hint?: string;
  href?: string;
  action?: () => void;
  group: string;
  icon: typeof Search;
};

const navCommands: Command[] = [
  { id: "nav-home", label: "Главная", href: "/", group: "Навигация", icon: LayoutDashboard },
  { id: "nav-tx", label: "Операции", href: "/transactions", group: "Навигация", icon: ReceiptText },
  { id: "nav-accounts", label: "Счета", href: "/accounts", group: "Навигация", icon: Wallet },
  { id: "nav-budgets", label: "Бюджеты", href: "/budgets", group: "Навигация", icon: CreditCard },
  { id: "nav-goals", label: "Цели", href: "/goals", group: "Навигация", icon: PiggyBank },
  { id: "nav-recurring", label: "Плановые платежи", href: "/recurring", group: "Навигация", icon: CalendarClock },
  { id: "nav-forecast", label: "Прогноз", href: "/forecast", group: "Навигация", icon: TrendingUp },
  { id: "nav-analytics", label: "Аналитика", href: "/analytics", group: "Навигация", icon: BarChart3 },
  { id: "nav-investments", label: "Инвестиции", href: "/investments", group: "Навигация", icon: LineChart },
  { id: "nav-categories", label: "Категории", href: "/categories", group: "Навигация", icon: Tags },
  { id: "nav-import", label: "Импорт и экспорт", href: "/import", group: "Навигация", icon: Download },
  { id: "nav-settings", label: "Настройки", href: "/settings", group: "Навигация", icon: Settings }
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dynamic, setDynamic] = useState<Command[]>([]);
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
            hint: "Счёт",
            href: `/transactions?accountId=${encodeURIComponent(account.id)}`,
            group: "Счета",
            icon: Wallet
          })),
          ...categories.categories.map((category) => ({
            id: `cat-${category.id}`,
            label: category.name,
            hint: category.kind === "INCOME" ? "Категория дохода" : "Категория расхода",
            href: `/transactions?categoryId=${encodeURIComponent(category.id)}${category.kind === "EXPENSE" ? "&type=EXPENSE" : ""}`,
            group: "Категории",
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
  }, [open]);

  const actionCommands: Command[] = useMemo(
    () => [
      {
        id: "act-add",
        label: "Добавить операцию",
        hint: "Alt+N",
        action: () => window.dispatchEvent(new Event("quick-add-open")),
        group: "Действия",
        icon: Plus
      }
    ],
    []
  );

  const filtered = useMemo(() => {
    const all = [...actionCommands, ...navCommands, ...dynamic];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((command) => command.label.toLowerCase().includes(q));
  }, [actionCommands, dynamic, query]);

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
            placeholder="Поиск разделов, счетов, категорий…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Ничего не найдено</p>
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
                  <span className="flex-1 truncate">{command.label}</span>
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
          <span>↑↓ выбрать · Enter открыть · Esc закрыть</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
