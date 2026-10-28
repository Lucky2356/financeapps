"use client";

// «Создать таблицу» — вместо пустого листа, с которого не понятно, что делать.
// Несколько вопросов на одном экране: с какого месяца, сколько денег и дохода,
// какие статьи вести. Статьи — это СВОИ категории из учёта, уже с суммами:
// приложение знает, сколько в среднем уходило на каждую за последние месяцы, и
// подсказывает это число. Остаётся нажать «Создать».
//
// Прошлые месяцы можно сразу заполнить тем, что записано в учёте, — таблица
// создаётся не пустой, а с историей.
//
// Сверху — шаблон: свои категории, семейный бюджет, ремонт, отпуск или с нуля.
// Шаблон задаёт статьи и остальные столбцы (lib/sheet/templates); статьи всё
// равно можно снять и вписать им суммы.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { SheetCount, SheetFormat, SheetWords } from "@/components/sheet/sheet-types";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import type { SheetPageData } from "@/lib/api/local/sheet";
import type { ImportPageData } from "@/lib/data";
import { factFill } from "@/lib/sheet/fill";
import { computeSheet } from "@/lib/sheet/model";
import {
  matchCategory,
  SHEET_TEMPLATE_IDS,
  SHEET_TEMPLATES,
  type SheetTemplateId
} from "@/lib/sheet/templates";
import { cn } from "@/lib/utils";

type Facts = Record<string, Record<string, number>>;
type ArticlePick = { on: boolean; monthly: string };
type PresetPick = ArticlePick & { name: string };

const AGO = [0, 1, 3, 6, 12] as const;
const MONTH_CHOICES = [6, 12, 18, 24, 36] as const;
/** Сколько прошедших месяцев смотрим, чтобы подсказать средние суммы. */
const LOOKBACK = 3;

export function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1 + by, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

export function SheetWizard({
  sheetId = "main",
  open,
  onOpenChange,
  categories,
  current,
  words,
  format,
  count,
  onCreated
}: {
  sheetId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ImportPageData["categories"];
  current: string;
  words: SheetWords;
  format: SheetFormat;
  count: SheetCount;
  onCreated: () => Promise<void>;
}) {
  const expenses = useMemo(
    () => categories.filter((category) => category.kind === "EXPENSE"),
    [categories]
  );
  const incomeIds = useMemo(
    () => new Set(categories.filter((category) => category.kind === "INCOME").map((c) => c.id)),
    [categories]
  );

  const [ago, setAgo] = useState<number>(0);
  const [months, setMonths] = useState<number>(12);
  const [opening, setOpening] = useState("");
  const [income, setIncome] = useState("");
  const [savings, setSavings] = useState(true);
  const [savingsOpening, setSavingsOpening] = useState("");
  const [history, setHistory] = useState(true);
  const [picks, setPicks] = useState<Record<string, ArticlePick>>({});
  // Шаблон, который выбрал человек; пока не выбрал — свои категории, а если
  // категорий расходов нет вовсе — семейный бюджет.
  const [chosenTemplate, setChosenTemplate] = useState<SheetTemplateId | null>(null);
  const template: SheetTemplateId =
    chosenTemplate ?? (expenses.length > 0 ? "categories" : "family");
  const [presets, setPresets] = useState<PresetPick[]>([]);
  // Средние траты по категориям — подсказка суммы и статьям шаблона, у которых
  // нашлась такая же категория в учёте.
  const [averages, setAverages] = useState<Record<string, number>>({});
  // Порядок задаётся один раз, когда пришёл факт: по убыванию трат. Сортировать
  // по набираемой сумме нельзя — строка убегала бы из-под пальца на каждой цифре.
  const [rank, setRank] = useState<string[]>([]);
  // Подсказка из учёта приходит не сразу. Человек, успевший что-то отметить до
  // неё, не должен увидеть, как его выбор затирается «средними суммами».
  const touched = useRef(false);
  const templateTouched = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Подсказка из учёта: средние суммы за последние месяцы. Читается, когда окно
  // открыли, — не раньше, чтобы не ходить за фактом тем, кто мастер не открывал.
  //
  // «Человек уже выбирал» сбрасывается только при открытии окна. Подсказка
  // перечитывается и тогда, когда пришёл новый список категорий (экран
  // перечитал свои данные), — и раньше вместе с ней сбрасывалось и это: уже
  // введённые суммы молча заменялись средними («25 000» становилось «41 000»).
  useEffect(() => {
    if (open) touched.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);
    const from = shiftMonth(current, -LOOKBACK);
    const to = shiftMonth(current, -1);
    apiClient
      .get(`/sheet/facts?from=${from}&to=${to}`)
      .catch(() => ({ months: {} as Facts }))
      .then(({ months: facts }) => {
        if (!alive) return;
        const seen = Object.keys(facts).length || 1;
        const average = (id: string) =>
          Object.values(facts).reduce((sum, byCategory) => sum + (byCategory[id] ?? 0), 0) / seen;
        const ranked = [...expenses].sort((a, b) => average(b.id) - average(a.id));
        setRank(ranked.map((category) => category.id));
        setAverages(
          Object.fromEntries(expenses.map((category) => [category.id, average(category.id)]))
        );
        // Категорий расходов нет — сразу семейный бюджет, а не пустой список.
        if (expenses.length === 0 && !templateTouched.current) {
          setChosenTemplate("family");
          setPresets(
            SHEET_TEMPLATES.family.articles.map((name) => ({ name, on: true, monthly: "" }))
          );
        }
        setLoaded(true);
        if (touched.current) return;
        const spent = ranked.filter((category) => average(category.id) > 0);
        const chosen = new Set(
          (spent.length ? spent : ranked).slice(0, spent.length ? 12 : 8).map((c) => c.id)
        );
        setPicks(
          Object.fromEntries(
            expenses.map((category) => {
              const avg = average(category.id);
              return [
                category.id,
                { on: chosen.has(category.id), monthly: avg > 0 ? String(roundTo(avg, 100)) : "" }
              ];
            })
          )
        );
        const earned = [...incomeIds].reduce((sum, id) => sum + average(id), 0);
        setIncome((was) => was || (earned > 0 ? String(roundTo(earned, 100)) : ""));
      });
    return () => {
      alive = false;
    };
  }, [open, current, expenses, incomeIds]);

  const ordered = useMemo(() => {
    const position = new Map(rank.map((id, index) => [id, index]));
    return [...expenses].sort((a, b) => (position.get(a.id) ?? 1e6) - (position.get(b.id) ?? 1e6));
  }, [expenses, rank]);
  const fromCategories = template === "categories";
  const chosenCount = fromCategories
    ? ordered.filter((category) => picks[category.id]?.on).length
    : presets.filter((preset) => preset.on).length;

  /** Статьи шаблона — все отмечены; сумма подсказана, если такая категория есть в учёте. */
  function pickTemplate(id: SheetTemplateId) {
    const chosen = SHEET_TEMPLATES[id];
    templateTouched.current = true;
    setChosenTemplate(id);
    const least = Math.max(chosen.months, ago + 6);
    setMonths(MONTH_CHOICES.find((choice) => choice >= least) ?? 36);
    setSavings(chosen.savingsByDefault);
    setPresets(
      chosen.articles.map((name) => {
        const avg = averages[matchCategory(name, expenses)?.id ?? ""] ?? 0;
        return { name, on: true, monthly: avg > 0 ? String(roundTo(avg, 100)) : "" };
      })
    );
  }

  function setAllPicks(on: boolean) {
    touched.current = true;
    if (!fromCategories) {
      setPresets((was) => was.map((preset) => ({ ...preset, on })));
      return;
    }
    setPicks((was) =>
      Object.fromEntries(
        expenses.map((category) => [category.id, { monthly: was[category.id]?.monthly ?? "", on }])
      )
    );
  }

  async function create() {
    setBusy(true);
    try {
      const from = shiftMonth(current, -ago);
      const articles = fromCategories
        ? ordered
            .filter((category) => picks[category.id]?.on)
            .map((category) => ({
              name: category.label,
              categoryId: category.id,
              monthly: picks[category.id]?.monthly ?? ""
            }))
        : presets
            .filter((preset) => preset.on)
            .map((preset) => ({
              name: preset.name,
              categoryId: matchCategory(preset.name, expenses)?.id ?? null,
              monthly: preset.monthly
            }));
      const created = (await apiClient.post("/sheet", {
        sheetId,
        action: "start",
        template,
        from,
        months,
        opening,
        income,
        savings,
        savingsOpening,
        articles
      })) as SheetPageData;

      if (history && ago > 0) {
        const facts = await apiClient
          .get(`/sheet/facts?from=${from}&to=${shiftMonth(current, -1)}`)
          .catch(() => ({ months: {} as Facts }));
        const changes = factFill(
          computeSheet(created).rows,
          created.columns,
          facts.months,
          // Поверх суммы «в месяц»: за прошедший месяц правда важнее плана.
          { before: current, overwrite: true, incomeCategoryIds: incomeIds }
        );
        if (changes.length > 0) {
          await apiClient.post("/sheet", { sheetId, action: "setCells", cells: changes });
        }
      }
      await onCreated();
      toast.success(
        format(words.wizCreated, {
          months: count(months, "months"),
          articles: count(articles.length, "articles")
        })
      );
      onOpenChange(false);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fromLabels: Record<(typeof AGO)[number], string> = {
    0: words.wizFromNow,
    1: words.wizFromAgo1,
    3: words.wizFromAgo3,
    6: words.wizFromAgo6,
    12: words.wizFromAgo12
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-testid="sheet-wizard">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <DialogHeader>
            <DialogTitle>{words.wizTitle}</DialogTitle>
            <DialogDescription>{words.wizLead}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label id="wiz-template">{words.wizTemplate}</Label>
            <div
              role="radiogroup"
              aria-labelledby="wiz-template"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              data-testid="wizard-templates"
            >
              {SHEET_TEMPLATE_IDS.filter((id) => id !== "categories" || expenses.length > 0).map(
                (id) => {
                  const on = template === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      data-template={id}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition-colors",
                        on
                          ? "border-foreground bg-foreground/[0.06] ring-1 ring-foreground"
                          : "hover:bg-foreground/[0.04]"
                      )}
                      onClick={() => pickTemplate(id)}
                    >
                      <span className="block text-sm font-medium">
                        {words.wizTemplates[id].name}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {words.wizTemplates[id].text}
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{words.wizFrom}</Label>
              <Select
                value={String(ago)}
                onValueChange={(value) => {
                  const next = Number(value);
                  setAgo(next);
                  // Таблица должна дотягиваться и до будущего: минимум полгода вперёд.
                  if (months < next + 6) {
                    setMonths(MONTH_CHOICES.find((choice) => choice >= next + 12) ?? 36);
                  }
                }}
              >
                <SelectTrigger aria-label={words.wizFrom}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGO.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {fromLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{words.wizMonths}</Label>
              <Select value={String(months)} onValueChange={(value) => setMonths(Number(value))}>
                <SelectTrigger aria-label={words.wizMonths}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_CHOICES.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {count(value, "months")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wiz-opening">{words.wizOpening}</Label>
              <Input
                id="wiz-opening"
                inputMode="decimal"
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{words.wizOpeningHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-income">{words.wizIncome}</Label>
              <Input
                id="wiz-income"
                inputMode="decimal"
                value={income}
                onChange={(event) => setIncome(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{words.wizIncomeHint}</p>
            </div>
          </div>

          {template === "blank" ? (
            <p className="text-xs text-muted-foreground" data-testid="wizard-blank">
              {words.wizBlankHint}
            </p>
          ) : (
            <fieldset className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="text-sm font-medium">{words.wizArticles}</legend>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAllPicks(true)}>
                    {words.wizAll}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAllPicks(false)}
                  >
                    {words.wizNone}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{words.wizArticlesHint}</p>
              <ul
                className="divide-y rounded-lg border"
                data-testid="wizard-articles"
                data-template={template}
                data-loaded={loaded ? "true" : "false"}
              >
                {fromCategories
                  ? ordered.map((category) => {
                      const pick: ArticlePick = picks[category.id] ?? { on: false, monthly: "" };
                      return (
                        <ArticleRow
                          key={category.id}
                          label={category.label}
                          color={category.color}
                          pick={pick}
                          monthlyLabel={words.wizMonthly}
                          onChange={(next) => {
                            touched.current = true;
                            setPicks((was) => ({ ...was, [category.id]: next }));
                          }}
                        />
                      );
                    })
                  : presets.map((preset, index) => (
                      <ArticleRow
                        key={preset.name}
                        label={preset.name}
                        pick={preset}
                        monthlyLabel={words.wizMonthly}
                        onChange={(next) =>
                          setPresets((was) =>
                            was.map((item, at) => (at === index ? { ...item, ...next } : item))
                          )
                        }
                      />
                    ))}
              </ul>
            </fieldset>
          )}

          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={savings}
                onChange={(event) => setSavings(event.target.checked)}
              />
              {words.wizSavings}
            </label>
            {savings ? (
              <div className="ml-6 max-w-xs space-y-1.5">
                <Label htmlFor="wiz-savings">{words.wizSavingsOpening}</Label>
                <Input
                  id="wiz-savings"
                  inputMode="decimal"
                  value={savingsOpening}
                  onChange={(event) => setSavingsOpening(event.target.value)}
                />
              </div>
            ) : null}
            {ago > 0 ? (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={history}
                  onChange={(event) => setHistory(event.target.checked)}
                />
                <span>
                  {words.wizHistory}
                  <span className="block text-xs text-muted-foreground">
                    {words.wizHistoryHint}
                  </span>
                </span>
              </label>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {words.cancel}
            </Button>
            <Button type="submit" disabled={busy || (template !== "blank" && chosenCount === 0)}>
              {words.wizCreate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Строка статьи: отметка, название и сумма в месяц. */
function ArticleRow({
  label,
  color,
  pick,
  monthlyLabel,
  onChange
}: {
  label: string;
  color?: string;
  pick: ArticlePick;
  monthlyLabel: string;
  onChange: (next: ArticlePick) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-primary"
          checked={pick.on}
          onChange={(event) => onChange({ ...pick, on: event.target.checked })}
        />
        {color ? (
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        ) : null}
        <span className="truncate">{label}</span>
      </label>
      <Input
        aria-label={`${label}: ${monthlyLabel}`}
        placeholder={monthlyLabel}
        inputMode="decimal"
        className="h-8 w-28 text-right tabular-nums"
        disabled={!pick.on}
        value={pick.monthly}
        onChange={(event) => onChange({ ...pick, monthly: event.target.value })}
      />
    </li>
  );
}
