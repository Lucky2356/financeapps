"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { MarketSecurity } from "@/services/market/MarketDataService";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { ASSET_KINDS, type AssetKind } from "@/types/enums";

// Live search over the whole MOEX universe so the user can add ANY listed
// security. It used to look at the shares board alone, which is why a bond
// could not be found at all — the app was searching a list it was never on.
//
// Ведёт себя как поиск в банковском приложении, и это не про вид, а про три
// вещи: с клавиатуры (стрелки и Enter, механизм общий с командной строкой),
// пустое поле не пустое (свои бумаги и недавно искомое), и найденное
// упорядочено по смыслу, а не по алфавиту — за это отвечает
// lib/investments/security-match.ts.

/** Недавно выбранные бумаги — на устройстве, дальше него не уходят. */
const RECENT_KEY = "security-search-recent";
const RECENT_LIMIT = 5;

type Suggestion = { ticker: string; name: string };

function readRecent(): Suggestion[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as Suggestion[]).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function rememberRecent(security: Suggestion): void {
  try {
    const kept = readRecent().filter((item) => item.ticker !== security.ticker);
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(
        [{ ticker: security.ticker, name: security.name }, ...kept].slice(0, RECENT_LIMIT)
      )
    );
  } catch {
    /* приватное окно или запрет на хранение — недавние просто не запомнятся */
  }
}

export function SecuritySearch({
  currency,
  onSelect,
  placeholder,
  /** Бумаги, которые у человека уже есть: портфель и список наблюдения. */
  owned = []
}: {
  currency: string;
  onSelect: (security: MarketSecurity) => void;
  placeholder?: string;
  owned?: Suggestion[];
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | null>(null);
  // Найденное хранится вместе с запросом, которому отвечает. Иначе при очистке
  // и повторном наборе на четверть секунды показывалась бы прошлая выдача — как
  // будто приложение уже что-то нашло по новому запросу.
  const [found, setFound] = useState<{ query: string; items: MarketSecurity[] }>({
    query: "",
    items: []
  });
  const [loading, setLoading] = useState(false);
  // Читается сразу, а не эффектом: на сервере localStorage нет, поэтому проверка
  // на окно — так же, как в «Быстром старте».
  const [recent, setRecent] = useState<Suggestion[]>(() =>
    typeof window === "undefined" ? [] : readRecent()
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const data = await apiClient.get<{ results: MarketSecurity[] }>(
            `/investments/search?q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ""}`
          );
          if (!cancelled) setFound({ query: q, items: data.results ?? [] });
        } catch {
          if (!cancelled) setFound({ query: q, items: [] });
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, kind]);

  // Пока не набрано ничего — то, что человек и так знает: сначала свои бумаги,
  // потом недавно искомые. Пустой список в поиске, которым пользуются часто,
  // это выброшенный экран.
  const seen = new Set<string>();
  const suggestions = [...owned, ...recent].filter((item) => {
    if (seen.has(item.ticker)) return false;
    seen.add(item.ticker);
    return true;
  });

  const showingSuggestions = query.trim().length === 0;
  const results = found.query === query.trim() ? found.items : [];
  const rows: Array<MarketSecurity | Suggestion> = showingSuggestions ? suggestions : results;

  function choose(row: MarketSecurity | Suggestion) {
    rememberRecent(row);
    setRecent(readRecent());
    if ("price" in row) {
      onSelect(row);
      return;
    }
    // Подсказка знает только тикер и название; остальное берётся тем же
    // запросом, каким пользуется поиск, чтобы наверх ушла настоящая бумага.
    void (async () => {
      const data = await apiClient
        .get<{
          results: MarketSecurity[];
        }>(`/investments/search?q=${encodeURIComponent(row.ticker)}`)
        .catch(() => null);
      const found = data?.results?.find((item) => item.ticker === row.ticker) ?? data?.results?.[0];
      if (found) onSelect(found);
    })();
  }

  // Два состояния, в которых показывать нечего, и строка, которая говорит какое.
  // Названо, а не вложено в цепочку тернарников: порядок проверок важен —
  // «ищем» и «ничего не нашлось» выглядят одинаково пусто, и увидеть второе,
  // пока идёт первое, значит решить, что бумаги нет.
  let insteadOfRows: string | null = null;
  if (loading && results.length === 0 && !showingSuggestions) insteadOfRows = t("inv.searching");
  else if (rows.length === 0) insteadOfRows = t("cmd.nothingFound");

  const { activeIndex, setActiveIndex, onKeyDown } = useListKeyboard(
    rows,
    choose,
    `${query}|${kind}`
  );
  const listRef = useRef<HTMLDivElement>(null);

  // Подсвеченная стрелками строка обязана быть на виду, иначе клавиатура
  // работает вслепую на всём, что ниже пятой строки.
  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? t("inv.searchPlaceholder")}
          className="pl-9"
          autoFocus
        />
      </div>
      {/* Narrowing by kind matters most where the list is longest: there are
          thousands of bonds, and a plain text search over all of them buries
          the one you hold. */}
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={t("inv.kind.label")}
        data-testid="asset-kind-filter"
      >
        {[null, ...ASSET_KINDS.filter((item) => item !== "OTHER")].map((item) => (
          <button
            key={item ?? "all"}
            type="button"
            aria-pressed={kind === item}
            onClick={() => setKind(item)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              kind === item
                ? "bg-secondary text-primary"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            {item ? t(`inv.kind.${item}`) : t("inv.kind.all")}
          </button>
        ))}
      </div>
      {rows.length > 0 || !showingSuggestions ? (
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {showingSuggestions ? (
            <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
              {t("inv.search.yours")}
            </p>
          ) : null}
          <div ref={listRef} data-testid="security-search-results">
            {insteadOfRows !== null ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">{insteadOfRows}</p>
            ) : (
              rows.map((row, index) => (
                <button
                  key={row.ticker}
                  type="button"
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(row)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0",
                    index === activeIndex ? "bg-muted/60" : "hover:bg-muted/50"
                  )}
                >
                  <span className="min-w-0">
                    <span className="font-semibold">{row.ticker}</span>{" "}
                    <span className="text-muted-foreground">{row.name}</span>
                    {"assetKind" in row ? (
                      <span className="block text-xs text-muted-foreground">
                        {t(`inv.kind.${row.assetKind}`)}
                      </span>
                    ) : null}
                  </span>
                  {"price" in row ? (
                    <span className="shrink-0 text-right">
                      {/* Ноль здесь означает «сегодня не торговалась», а не
                          «стоит нисколько»: раньше такие бумаги просто не
                          показывались, и облигацию нельзя было найти вовсе. */}
                      <span className="block font-medium">
                        {row.price > 0 ? formatCurrency(row.price, currency) : t("inv.noPrice")}
                      </span>
                      {row.price > 0 ? (
                        <span
                          className={
                            row.changeDay >= 0 ? "text-xs text-success" : "text-xs text-destructive"
                          }
                        >
                          {row.changeDay >= 0 ? "+" : ""}
                          {row.changeDay.toFixed(2)}%
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
