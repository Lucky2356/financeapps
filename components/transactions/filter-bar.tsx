"use client";

import { Check, ChevronDown, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
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
  periodIsUnset,
  periodPresetOf,
  periodRange,
  withFilter,
  type ChipKind,
  type PeriodPresetId
} from "@/lib/transactions/filter-chips";
import { parseCategoryIds } from "@/lib/transactions/filter";
import { cn } from "@/lib/utils";

type SavedFilter = { name: string; params: string };
const SAVED_FILTERS_KEY = "tx-saved-filters";

/**
 * The filters of the operations list: one line beside the list's own title.
 *
 * They used to hide behind a window — the owner had to open it, change
 * something, and close it again to see the result. Nothing hides now: category,
 * the two ends of the period, account and type are on the line itself, and the
 * gear next to them holds only what is asked for rarely (named periods, amount
 * range, tag, page size, saved filters). Every control writes its parameter the
 * moment it is touched; there is no "apply" anywhere.
 *
 * The screen opens on the current month rather than on the whole ledger: the
 * question people arrive with is what has happened this month. "За всё время"
 * is one click away and says so in the URL, which is how it is told apart from
 * a period nobody has chosen yet.
 *
 * Filtering itself still lives in the URL (see `lib/transactions/filter.ts`) —
 * this is only the remote control for it.
 */
export function TransactionFilterBar({
  categories,
  accounts,
  defaultLimit,
  title
}: {
  categories: CategoryOption[];
  accounts: TransactionsPageData["accounts"];
  defaultLimit: number;
  /** The list's heading — kept on the same line as the filters that trim it. */
  title?: ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();

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

  // Arriving with nothing said about a period means the current month — written
  // into the URL rather than assumed, so the dates in the fields, the chips, the
  // list and any link copied out of here all agree on what is being shown.
  useEffect(() => {
    if (!periodIsUnset(new URLSearchParams(paramsString))) return;
    const month = periodRange("thisMonth");
    if (!month) return;
    const next = new URLSearchParams(paramsString);
    next.set("from", month.from);
    next.set("to", month.to);
    router.replace(`/transactions?${next.toString()}`);
  }, [paramsString, router]);

  const preset = periodPresetOf(searchParams);
  const chips = describeFilters(searchParams, {
    categories,
    accounts: accounts.map((account) => ({ id: account.id, label: account.name })),
    label: (kind, value) => chipLabel(t, kind, value, preset)
  });
  const count = activeFilterCount(searchParams);
  const selectedCategories = parseCategoryIds(searchParams.get("categoryId"));
  const type = searchParams.get("type") ?? "ALL";
  const accountId = searchParams.get("accountId") || ALL_OPTION;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {title ? <div className="mr-auto">{title}</div> : null}

        {/* Resetting was reachable from two places nobody looks: inside the
            gear, and at the tail of the chip list below, after however many
            lines the chips happen to wrap onto. It opens the row now, ahead of
            the controls it undoes — and only when there is something to reset,
            an always-visible button that usually does nothing being its own
            kind of noise. Clearing goes back to the current month, the state
            the screen opens in. */}
        {count > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-muted-foreground"
            onClick={() => go("")}
          >
            <X className="size-4" />
            {t("tx.filters.clearAll")}
          </Button>
        ) : null}

        <CategoryFilter
          categories={categories}
          selected={selectedCategories}
          onChange={(ids) => setParam("categoryId", ids.join(","))}
        />

        {/* The period as the two dates it actually is. A named period fills
            both in (the gear holds the names); typing over one of them keeps
            the other. */}
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label={t("tx.from")}
            value={searchParams.get("from") ?? ""}
            max={searchParams.get("to") || undefined}
            onChange={(event) => setParam("from", event.target.value)}
            className="h-9 w-[9.5rem] px-2"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            aria-label={t("tx.to")}
            value={searchParams.get("to") ?? ""}
            min={searchParams.get("from") || undefined}
            onChange={(event) => setParam("to", event.target.value)}
            className="h-9 w-[9.5rem] px-2"
          />
        </div>

        <Select
          value={accountId}
          onValueChange={(value) => setParam("accountId", value === ALL_OPTION ? "" : value)}
        >
          <SelectTrigger className="h-9 w-auto min-w-[8rem]" aria-label={t("tx.account")}>
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

        <Select
          value={type}
          onValueChange={(value) => setParam("type", value === "ALL" ? "" : value)}
        >
          <SelectTrigger className="h-9 w-auto min-w-[7rem]" aria-label={t("tx.type")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("tx.type.all")}</SelectItem>
            <SelectItem value="EXPENSE">{t("tx.type.expense")}</SelectItem>
            <SelectItem value="INCOME">{t("tx.type.income")}</SelectItem>
            {/* Both halves of a transfer are ordinary rows; this picks out the
                pair rather than a type of its own. */}
            <SelectItem value="TRANSFER">{t("tx.type.transfer")}</SelectItem>
          </SelectContent>
        </Select>

        <MoreFilters
          defaultLimit={defaultLimit}
          paramsString={paramsString}
          count={count}
          onGo={go}
          onSetParam={setParam}
        />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t("tx.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("tx.search.placeholder")}
          className="h-9 pl-9"
        />
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
          {/* Resetting everything used to live here too, at the end of a list
              that wraps onto its own lines — the last place the eye lands. It
              is on the bar itself now, beside the controls that set the
              filters; each chip keeps its own ✕ for dropping just one. */}
        </div>
      ) : null}
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
      if (value === "INCOME") return t("tx.type.income");
      return value === "TRANSFER" ? t("tx.type.transfer") : t("tx.type.expense");
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

// ── An anchored panel ───────────────────────────────────────────────────────
// Not a modal: the list stays visible and keeps re-filtering underneath while
// the panel is open, which is the whole point of applying on the spot.
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

const TRIGGER =
  "flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:border-ring/40 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

// ── The gear ────────────────────────────────────────────────────────────────
// What the line has no room for and the owner asks for rarely. Everything here
// applies on the spot too; the panel closes by clicking away from it.
function MoreFilters({
  defaultLimit,
  paramsString,
  count,
  onGo,
  onSetParam
}: {
  defaultLimit: number;
  paramsString: string;
  count: number;
  onGo: (next: URLSearchParams | string) => void;
  onSetParam: (key: string, value: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

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
  // The list's own default is 20, which was not among the sizes on offer — so
  // the control sat there empty until something was picked. Whatever size is
  // actually in force is listed, even when it is not one of the three.
  const pageSize = params.get("limit") ?? String(defaultLimit);
  // "all" is a size the list understands but the picker cannot show, so the
  // checkbox below owns that state and the picker is left inert while it holds.
  const onePage = pageSize === "all";
  const pageSizes = [...new Set([pageSize, "20", "50", "100"])]
    .filter((size) => Number(size) > 0)
    .sort((a, b) => Number(a) - Number(b));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t("tx.filters")}
        className={cn(TRIGGER, "px-2.5")}
      >
        <SlidersHorizontal className="size-4" />
        {count > 0 ? (
          <span className="num inline-flex min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
            {count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-[19rem] max-w-[calc(100vw-2rem)] space-y-3 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg">
          {/* The dates themselves are on the bar; these only fill them in. */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("tx.period")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_PRESETS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onGo(applyPeriodPreset(new URLSearchParams(params), id))}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted",
                    periodPresetOf(params) === id && "border-primary bg-primary/10 text-primary"
                  )}
                >
                  {t(`tx.period.${id}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="flt-min" className="text-xs">
                {t("tx.minAmount")}
              </Label>
              <Input
                id="flt-min"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0"
                className="h-9"
                value={minAmount}
                onChange={(event) => setMinAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flt-max" className="text-xs">
                {t("tx.maxAmount")}
              </Label>
              <Input
                id="flt-max"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="∞"
                className="h-9"
                value={maxAmount}
                onChange={(event) => setMaxAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flt-tag" className="text-xs">
                {t("tx.tag")}
              </Label>
              <Input
                id="flt-tag"
                className="h-9"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                placeholder={t("tx.tagPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flt-limit" className="text-xs">
                {t("tx.perPage")}
              </Label>
              <Select
                value={pageSize}
                disabled={onePage}
                onValueChange={(value) => onSetParam("limit", value)}
              >
                <SelectTrigger id="flt-limit" className="h-9">
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

          {/* Everything on one screen, for reading a whole month at once or
              printing it. `limit=all` is what the ledger already understood —
              export and duplicate search ask for it — so this only puts the
              switch where the owner can reach it. The page-size list goes
              inert meanwhile rather than disappearing, so it stays obvious
              what the checkbox is overriding. */}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 rounded border accent-primary"
              checked={onePage}
              data-testid="one-page-toggle"
              onChange={(event) => onSetParam("limit", event.target.checked ? "all" : "")}
            />
            <span>{t("tx.onePage")}</span>
          </label>

          <SavedFilters
            currentParams={paramsString}
            onApply={(value) => {
              onGo(value);
              close();
            }}
          />

          {count > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                onGo("");
                close();
              }}
            >
              {t("tx.filters.clearAll")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Multi-category filter. Income and spending are listed apart on purpose: some
// names exist on both sides — "Переводы" most of all — and a flat list gave no
// way to tell which one you were ticking.
function CategoryFilter({
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
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  function toggle(categoryId: string) {
    onChange(
      selected.includes(categoryId)
        ? selected.filter((id) => id !== categoryId)
        : [...selected, categoryId]
    );
  }

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
  const only = selected.length === 1 ? categories.find((item) => item.id === selected[0]) : null;
  const label =
    selected.length === 0
      ? t("tx.allCategories")
      : (only?.label ?? t("tx.categoriesSelected", { count: selected.length }));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t("common.category")}
        className={cn(TRIGGER, "max-w-[12rem]")}
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
          className="absolute z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
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
    <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
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
            className="h-8 w-32"
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
