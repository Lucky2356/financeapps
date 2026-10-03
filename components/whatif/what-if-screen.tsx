"use client";

// «Что если»: крупная покупка или кредит — до того, как тратить.
//
// Слева — что задумано: сумма, сразу или в кредит, откуда платить. Справа —
// ответ сразу, на каждое нажатие клавиши: хватит ли, что станет с подушкой,
// сколько останется в месяц, когда теперь получится каждая цель, и деньги на
// год вперёд — до и после. Ничего не записывается.

import { CheckCircle2, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { simulate, type WhatIfBase, type WhatIfScenario } from "@/lib/whatif/simulate";

const EMPTY: WhatIfBase = {
  currency: "RUB",
  liquid: 0,
  savings: 0,
  avgIncome: 0,
  avgExpense: 0,
  debtPayments: 0,
  cushionTarget: 3,
  goals: []
};

function number(text: string): number {
  const value = Number(text.replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

/** Деньги на год вперёд: две линии, «до» пунктиром. */
function Path({
  before,
  after,
  money,
  months,
  danger
}: {
  before: number[];
  after: number[];
  money: (value: number) => string;
  months: string[];
  danger: boolean;
}) {
  const width = 560;
  const height = 200;
  const pad = { left: 8, right: 8, top: 16, bottom: 24 };
  const all = [...before, ...after, 0];
  const top = Math.max(...all);
  const bottom = Math.min(...all);
  const span = top - bottom || 1;
  const x = (index: number) =>
    pad.left + (index / (before.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + ((top - value) / span) * (height - pad.top - pad.bottom);
  const line = (points: number[]) =>
    points
      .map(
        (value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`
      )
      .join(" ");
  return (
    <figure className="space-y-2" data-testid="what-if-path">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="">
        {bottom < 0 ? (
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(0)}
            y2={y(0)}
            className="stroke-destructive/50"
            strokeDasharray="2 4"
          />
        ) : null}
        <path
          d={line(before)}
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth={2}
          strokeDasharray="5 5"
        />
        <path
          d={line(after)}
          fill="none"
          className={danger ? "stroke-destructive" : "stroke-success"}
          strokeWidth={2.5}
        />
        <circle
          cx={x(after.length - 1)}
          cy={y(after[after.length - 1])}
          r={4}
          className={danger ? "fill-destructive" : "fill-success"}
        />
        {[0, 6, 12].map((index) => (
          <text
            key={index}
            x={x(index)}
            y={height - 6}
            textAnchor={index === 0 ? "start" : index === 12 ? "end" : "middle"}
            className="fill-muted-foreground text-[11px]"
          >
            {months[index]}
          </text>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="mr-1 inline-block w-4 border-t-2 border-dashed border-muted-foreground align-middle" />
          {money(before[before.length - 1])}
        </span>
        <span className="font-medium text-foreground">
          <span
            className={cn(
              "mr-1 inline-block w-4 border-t-2 align-middle",
              danger ? "border-destructive" : "border-success"
            )}
          />
          {money(after[after.length - 1])}
        </span>
      </figcaption>
    </figure>
  );
}

export function WhatIfScreen() {
  const { t, locale } = useI18n();
  const { data: base } = useApiPageData<WhatIfBase>(EMPTY, "/what-if");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<WhatIfScenario["mode"]>("cash");
  const [from, setFrom] = useState<WhatIfScenario["from"]>("liquid");
  const [months, setMonths] = useState("12");
  const [rate, setRate] = useState("0");
  const [down, setDown] = useState("");

  const money = (value: number) => formatCurrency(value, base.currency);
  const oneDigit = (value: number) =>
    value.toLocaleString(locale === "en" ? "en-GB" : "ru-RU", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  const scenario: WhatIfScenario = {
    amount: number(amount),
    mode,
    from,
    months: Math.max(1, Math.round(number(months)) || 1),
    ratePercent: Math.max(0, number(rate)),
    downPayment: number(down)
  };
  // Расчёт — дюжина сложений: пересчитывать на каждый рендер дешевле, чем
  // следить за зависимостями.
  const result = simulate(base, scenario);

  const monthNames = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 13 }, (_, index) =>
      new Date(now.getFullYear(), now.getMonth() + index, 1).toLocaleDateString(
        locale === "en" ? "en-GB" : "ru-RU",
        { month: "short", year: "2-digit" }
      )
    );
  }, [locale]);

  const when = (count: number | null) =>
    count === null
      ? t("wi.never")
      : count === 0
        ? t("wi.done")
        : new Date(new Date().getFullYear(), new Date().getMonth() + count, 1).toLocaleDateString(
            locale === "en" ? "en-GB" : "ru-RU",
            { month: "long", year: "numeric" }
          );

  const has = scenario.amount > 0;
  const Verdict =
    result.verdict === "ok"
      ? CheckCircle2
      : result.verdict === "tight"
        ? TriangleAlert
        : ShieldAlert;

  const compare = (
    label: string,
    before: string,
    after: string,
    worse: boolean,
    testid: string
  ) => (
    <div className="rounded-lg border p-3" data-testid={testid}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm tabular-nums">
        <span className="text-muted-foreground">{before}</span>
        <span className="mx-1.5 text-muted-foreground">→</span>
        <span className={cn("font-semibold", worse && "text-destructive")}>{after}</span>
      </p>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("wi.plan")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="wi-amount">{t("wi.amount")}</Label>
            <AmountInput id="wi-amount" value={amount} onValueChange={setAmount} placeholder="0" />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("wi.how")}</Label>
            <Segmented
              ariaLabel={t("wi.how")}
              value={mode}
              onChange={setMode}
              options={[
                { value: "cash", label: t("wi.cash") },
                { value: "credit", label: t("wi.credit") }
              ]}
            />
          </div>
          {mode === "cash" ? (
            <div className="grid gap-1.5">
              <Label>{t("wi.from")}</Label>
              <Segmented
                ariaLabel={t("wi.from")}
                value={from}
                onChange={setFrom}
                options={[
                  { value: "liquid", label: t("wi.fromLiquid") },
                  { value: "savings", label: t("wi.fromSavings") }
                ]}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="wi-months">{t("wi.months")}</Label>
                <Input
                  id="wi-months"
                  inputMode="numeric"
                  value={months}
                  onChange={(event) => setMonths(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wi-rate">{t("wi.rate")}</Label>
                <Input
                  id="wi-rate"
                  inputMode="decimal"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                />
              </div>
              <div className="col-span-2 grid gap-1.5">
                <Label htmlFor="wi-down">{t("wi.down")}</Label>
                <AmountInput id="wi-down" value={down} onValueChange={setDown} placeholder="0" />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("wi.basis", {
              income: money(base.avgIncome),
              expense: money(base.avgExpense),
              liquid: money(base.liquid),
              savings: money(base.savings)
            })}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {!has ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">{t("wi.empty")}</CardContent>
          </Card>
        ) : (
          <>
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg border p-4",
                result.verdict === "ok" && "border-success/40 bg-success/10",
                result.verdict === "tight" && "border-warning/40 bg-warning/10",
                result.verdict === "danger" && "border-destructive/40 bg-destructive/10"
              )}
              data-testid="what-if-verdict"
              data-verdict={result.verdict}
            >
              <Verdict
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  result.verdict === "ok" && "text-success",
                  result.verdict === "tight" && "text-warning",
                  result.verdict === "danger" && "text-destructive"
                )}
              />
              <div className="space-y-1">
                <p className="font-semibold">{t(`wi.verdict.${result.verdict}`)}</p>
                {result.reasons.map((reason) => (
                  <p key={reason.key} className="text-sm">
                    {t(reason.key, {
                      ...reason.vars,
                      ...(typeof reason.vars?.short === "number"
                        ? { short: money(reason.vars.short) }
                        : {}),
                      ...(typeof reason.vars?.gap === "number"
                        ? { gap: money(reason.vars.gap) }
                        : {})
                    })}
                  </p>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {compare(
                t("wi.cushion"),
                t("wi.monthsShort", { count: oneDigit(result.cushionBefore) }),
                t("wi.monthsShort", { count: oneDigit(result.cushionAfter) }),
                result.cushionAfter < base.cushionTarget,
                "what-if-cushion"
              )}
              {compare(
                t("wi.free"),
                money(result.freeBefore),
                money(result.freeAfter),
                result.freeAfter < 0,
                "what-if-free"
              )}
              {mode === "credit" ? (
                <div className="rounded-lg border p-3" data-testid="what-if-payment">
                  <p className="text-xs text-muted-foreground">{t("wi.payment")}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    {money(result.monthlyPayment)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("wi.overpay", { amount: money(result.overpayment) })}
                  </p>
                </div>
              ) : (
                compare(
                  t("wi.inYear"),
                  money(result.pathBefore[12]),
                  money(result.pathAfter[12]),
                  result.pathAfter[12] < 0,
                  "what-if-year"
                )
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("wi.pathTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Path
                  before={result.pathBefore}
                  after={result.pathAfter}
                  money={money}
                  months={monthNames}
                  danger={result.verdict === "danger"}
                />
              </CardContent>
            </Card>

            {result.goals.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("wi.goals")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y text-sm" data-testid="what-if-goals">
                    {result.goals.map((goal) => {
                      const later =
                        goal.before !== null && (goal.after === null || goal.after > goal.before);
                      return (
                        <li
                          key={goal.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <span className="font-medium">{goal.title}</span>
                          <span className="tabular-nums">
                            <span className="text-muted-foreground">{when(goal.before)}</span>
                            <span className="mx-1.5 text-muted-foreground">→</span>
                            <span className={cn("font-semibold", later && "text-warning")}>
                              {when(goal.after)}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
