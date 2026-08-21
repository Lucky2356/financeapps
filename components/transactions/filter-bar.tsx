"use client";

import { Check, ChevronDown, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ALL_OPTION,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { TransactionsPageData } from "@/lib/data";
import type { CategoryOption } from "@/lib/data/demo-seed";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import {
  activeFilterCount,
  applyPeriodPreset,
  describeFilters,
  PERIOD_PRESETS,
  periodPresetOf,
  withFilter,
  type ChipKind,
  type PeriodPresetId
} from "@/lib/transactions/filter-chips";
import { parseCategoryIds } from "@/lib/transactions/filter";
import { cn } from "@/lib/utils";

type SavedFilter = { name: string; params: string };
const SAVED_FILTERS_KEY = "tx-saved-filters";

/**
 * The filter bar: one line that is always on screen, the active filters as
 * removable chips under it, and everything else behind "Фильтры".
 *
 * Filtering itself lives in the URL (see `lib/transactions/filter.ts`) and has
 * not changed — this is a different remote control for the same set. What is
 * new is that nothing has to be applied: every control writes its parameter as
 * soon as it is touched, and a chip's cross removes exactly one filter instead
 * of sending the owner back into a nine-field form to find it.
 */
export function TransactionFilterBar({
  categories,
  accounts,
  defaultLimit,
  actions
}: {
  categories: CategoryOption[];
  accounts: TransactionsPageData["accounts"];
  defaultLimit: number;
  /** The screen's own buttons (transfer, split, add) — shown on the same line. */
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();
  const [open, setOpen] = useState(false);

  const go = useCallback(
    (next: URLSearchParams | string) => {
      const query = typeof next === "string" ? next : next.toString();
      router.push(query ? `/transactions?${query}` : "/transactions");
    },
    [router]
  );
  const setParam = useCallback(
    (key: string, value: string) => go(withFilter(new URLSearchParams(paramsString), key, value)),
    [go, paramsString]
  );

  const [query, setQuery] = useDebouncedParam(searchParams.get("q") ?? "", "q", setParam);
  const preset = periodPresetOf(searchParams);
  const chips = describeFilters(searchParams, {
    categories,
    accounts: accounts.map((account) => ({ id: account.id, label: account.name })),
    label: (kind, value) => chipLabel(t, kind, value, preset)
  });
  const count = activeFilterCount(searchParams);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[11rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t("tx.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("tx.search.placeholder")}
            className="h-10 pl-9"
          />
        </div>

        <Select
          value={preset}
          onValueChange={(value) => {
            if (value === "custom") {
              setOpen(true);
              return;
            }
            go(
              applyPeriodPreset(
                new URLSearchParams(paramsString),
                value as Exclude<PeriodPresetId, "custom">
              )
            );
          }}
        >
          <SelectTrigger className="h-10 w-auto min-w-[9.5rem]" aria-label={t("tx.period.all")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_PRESETS.map((id) => (
              <SelectItem key={id} value={id}>
                {t(`tx.period.${id}`)}
              </SelectItem>
            ))}
            {/* Offered only once the dates are already their own thing: picking
                it from a named period would say nothing about which dates. */}
            {preset === "custom" ? (
              <SelectItem value="custom">{t("tx.period.custom")}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>

        <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(true)}>
          <SlidersHorizontal className="size-4" />
          {t("tx.filters")}
          {count > 0 ? (
            <span className="num ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
              {count}
            </span>
          ) : null}
        </Button>

        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      {chips.length > 0 ? (
        <div data-testid="filter-chips" className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 rounded-full border bg-card py-1 pl-2.5 pr-1.5 text-xs"
            >
              {chip.label}
              <button
                type="button"
                aria-label={`${t("tx.filters.clearOne")}: ${chip.label}`}
                onClick={() => go(chip.next)}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => go("")}
            className="rounded-full px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary"
          >
            {t("tx.filters.clearAll")}
          </button>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <FilterDialog
          categories={categories}
          accounts={accounts}
          defaultLimit={defaultLimit}
          paramsString={paramsString}
          onGo={go}
          onSetParam={setParam}
          onClose={() => setOpen(false)}
        />
      </Dialog>
    </div>
  );
}

/**
 * A text field that writes its parameter a moment after typing stops. One
 * letter is not a filter change, and pushing a URL per keystroke would put a
 * history entry behind every one of them.
 */
function useDebouncedParam(
  current: string,
  key: string,
  setParam: (key: string, value: string) => void
) {
  const [value, setValue] = useState(current);
  const known = useRef(current);

  // The URL can also change from elsewhere — a chip's cross, "clear all", a
  // saved filter. Follow it, but only when it is genuinely someone else's
  // change, or the field would fight the person typing into it.
  useEffect(() => {
    if (current === known.current) return;
    known.current = current;
    setValue(current);
  }, [current]);

  useEffect(() => {
    if (value === current) return;
    const timer = setTimeout(() => {
      known.current = value;
      setParam(key, value);
    }, 350);
    return () => clearTimeout(timer);
  }, [value, current, key, setParam]);

  return [value, setValue] as const;
}

function chipLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  kind: ChipKind,
  value: string,
  preset: PeriodPresetId
): string {
  switch (kind) {
    case "q":
      return t("tx.chip.q", { value });
    case "period": {
      if (preset !== "custom") return t(`tx.period.${preset}`);
      const [from, to] = value.split("→");
      if (from && to) return t("tx.chip.range", { from: formatDate(from), to: formatDate(to) });
      if (from) return t("tx.chip.from", { from: formatDate(from) });
      return t("tx.chip.to", { to: formatDate(to) });
    }
    case "type":
      return value === "INCOME" ? t("tx.type.income") : t("tx.type.expense");
    case "minAmount":
      return t("tx.chip.min", { amount: formatCurrency(Number(value)) });
    case "maxAmount":
      return t("tx.chip.max", { amount: formatCurrency(Number(value)) });
    case "tag":
      return t("tx.chip.tag", { value });
    default:
      return value;
  }
}

// ── The "more filters" window ───────────────────────────────────────────────
// Everything that has not earned a place on the always-visible line. Each
// control writes its parameter straight away, so the window has no "apply" —
// closing it is not a step, it is just closing it.
function FilterDialog({
  categories,
  accounts,
  defaultLimit,
  paramsString,
  onGo,
  onSetParam,
  onClose
}: {
  categories: CategoryOption[];
  accounts: TransactionsPageData["accounts"];
  defaultLimit: number;
  paramsString: string;
  onGo: (next: URLSearchParams | string) => void;
  onSetParam: (key: string, value: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const params = new URLSearchParams(paramsString);
  const [minAmount, setMinAmount] = useDebouncedParam(
    params.get("minAmount") ?? "",
    "minAmount",
    onSetParam
  );
  const [maxAmount, setMaxAmount] = useDebouncedParam(
    params.get("maxAmount") ?? "",
    "maxAmount",
    onSetParam
  );
  const [tag, setTag] = useDebouncedParam(params.get("tag") ?? "", "tag", onSetParam);
  const type = params.get("type") ?? "ALL";
  // The list's own default is 20, which was not among the sizes on offer — so
  // the control sat there empty until something was picked. Whatever size is
  // actually in force is listed, even when it is not one of the three.
  const pageSize = params.get("limit") ?? String(defaultLimit);
  const pageSizes = [...new Set([pageSize, "20", "50", "100"])]
    .filter((size) => Number(size) > 0)
    .sort((a, b) => Number(a) - Number(b));

  const types = [
    { value: "ALL", label: t("tx.type.all") },
    { value: "INCOME", label: t("tx.type.income") },
    { value: "EXPENSE", label: t("tx.type.expense") }
  ];

  return (
    <DialogContent className="max-h-[88vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t("tx.filters.title")}</DialogTitle>
        <DialogDescription>{t("tx.filters.desc")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="space-y-2">
          <Label>{t("tx.type")}</Label>
          <div className="flex gap-2">
            {types.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={type === item.value ? "default" : "outline"}
                className="flex-1"
                onClick={() => onSetParam("type", item.value === "ALL" ? "" : item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("common.category")}</Label>
          <CategoryMultiSelect
            categories={categories}
            selected={parseCategoryIds(params.get("categoryId"))}
            onChange={(ids) => onSetParam("categoryId", ids.join(","))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="flt-from">{t("tx.from")}</Label>
            <Input
              id="flt-from"
              type="date"
              value={params.get("from") ?? ""}
              onChange={(event) => onSetParam("from", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flt-to">{t("tx.to")}</Label>
            <Input
              id="flt-to"
              type="date"
              value={params.get("to") ?? ""}
              onChange={(event) => onSetParam("to", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flt-min">{t("tx.minAmount")}</Label>
            <Input
              id="flt-min"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0"
              value={minAmount}
              onChange={(event) => setMinAmount(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flt-max">{t("tx.maxAmount")}</Label>
            <Input
              id="flt-max"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="∞"
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flt-account">{t("tx.account")}</Label>
            <Select
              value={params.get("accountId") || ALL_OPTION}
              onValueChange={(value) => onSetParam("accountId", value === ALL_OPTION ? "" : value)}
            >
              <SelectTrigger id="flt-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>{t("tx.allAccounts")}</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="flt-tag">{t("tx.tag")}</Label>
            <Input
              id="flt-tag"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder={t("tx.tagPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flt-limit">{t("tx.perPage")}</Label>
            <Select value={pageSize} onValueChange={(value) => onSetParam("limit", value)}>
              <SelectTrigger id="flt-limit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SavedFilters currentParams={paramsString} onApply={onGo} />
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onGo("");
            onClose();
          }}
        >
          {t("tx.filters.clearAll")}
        </Button>
        <Button type="button" onClick={onClose}>
          {t("tx.filters.done")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// Multi-category filter. Income and spending are listed apart on purpose: some
// names exist on both sides — "Переводы" most of all — and a flat list gave no
// way to tell which one you were ticking.
function CategoryMultiSelect({
  categories,
  selected,
  onChange
}: {
  categories: CategoryOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function toggle(categoryId: string) {
    onChange(
      selected.includes(categoryId)
        ? selected.filter((id) => id !== categoryId)
        : [...selected, categoryId]
    );
  }

  // Close the dropdown on an outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups = [
    { kind: "INCOME" as const, title: t("cat.income") },
    { kind: "EXPENSE" as const, title: t("cat.expense") }
  ]
    .map((group) => ({
      ...group,
      items: categories.filter((category) => category.kind === group.kind)
    }))
    .filter((group) => group.items.length > 0);

  const allIds = categories.map((category) => category.id);
  const label =
    selected.length === 0
      ? t("tx.allCategories")
      : t("tx.categoriesSelected", { count: selected.length });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:border-ring/40 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
          {label}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div
          data-testid="category-filter-menu"
          className="absolute z-50 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {categories.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("tx.allCategories")}</p>
          ) : (
            <>
              <div className="mb-1 flex gap-1 border-b px-1 pb-1.5">
                <BulkButton onClick={() => onChange(allIds)}>{t("tx.checkAll")}</BulkButton>
                <BulkButton onClick={() => onChange([])}>{t("tx.uncheckAll")}</BulkButton>
              </div>
              {groups.map((group) => {
                const groupIds = group.items.map((category) => category.id);
                const allPicked = groupIds.every((groupId) => selected.includes(groupId));
                return (
                  <div key={group.kind} className="mb-1 last:mb-0">
                    <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {group.title}
                      </span>
                      <BulkButton
                        onClick={() =>
                          onChange(
                            allPicked
                              ? selected.filter((id) => !groupIds.includes(id))
                              : [...new Set([...selected, ...groupIds])]
                          )
                        }
                      >
                        {allPicked ? t("tx.uncheckAll") : t("tx.checkAll")}
                      </BulkButton>
                    </div>
                    {group.items.map((category) => {
                      const active = selected.includes(category.id);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => toggle(category.id)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input"
                            )}
                          >
                            {active ? <Check className="size-3" /> : null}
                          </span>
                          <span
                            className="flex size-5 shrink-0 items-center justify-center rounded-full text-white"
                            style={{ backgroundColor: category.color }}
                          >
                            <CategoryIcon name={category.icon} className="size-3" />
                          </span>
                          <span className="truncate">{category.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BulkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
    >
      {children}
    </button>
  );
}

// Named filter presets persisted in localStorage. Saving snapshots the currently
// applied URL params; applying navigates to them. No server involved.
function SavedFilters({
  currentParams,
  onApply
}: {
  currentParams: string;
  onApply: (params: string) => void;
}) {
  const { t } = useI18n();
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVED_FILTERS_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedFilter[];
      if (Array.isArray(parsed)) void Promise.resolve().then(() => setSaved(parsed));
    } catch {
      /* ignore malformed */
    }
  }, []);

  function persist(next: SavedFilter[]) {
    setSaved(next);
    try {
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }

  function confirmSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    persist([
      ...saved.filter((filter) => filter.name !== trimmed),
      { name: trimmed, params: currentParams }
    ]);
    setName("");
    setNaming(false);
    toast.success(t("tx.saved.savedToast"));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-xs font-medium text-muted-foreground">{t("tx.saved.title")}</span>
      {saved.map((filter) => (
        <span
          key={filter.name}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs"
        >
          <button
            type="button"
            className="hover:text-primary"
            onClick={() => onApply(filter.params)}
          >
            {filter.name}
          </button>
          <button
            type="button"
            aria-label={t("common.delete")}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => persist(saved.filter((item) => item.name !== filter.name))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {naming ? (
        <form onSubmit={confirmSave} className="flex items-center gap-1">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("tx.saved.namePlaceholder")}
            className="h-8 w-40"
            autoFocus
          />
          <Button type="submit" size="sm">
            {t("tx.dialog.create")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>
            {t("tx.dialog.cancel")}
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (!currentParams) {
              toast.info(t("tx.saved.empty"));
              return;
            }
            setNaming(true);
          }}
        >
          <Star className="size-3.5" />
          {t("tx.saved.save")}
        </Button>
      )}
    </div>
  );
}
