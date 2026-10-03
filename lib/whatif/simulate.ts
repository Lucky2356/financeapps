// «Что если»: как крупная покупка или кредит скажутся на деньгах — до покупки.
//
// Считается на тех же числах, что и вся остальная картина приложения: деньги
// на счетах, подушка на накопительных, средний доход и расход за три месяца,
// платежи по долгам, цели с их взносами. Ничего не записывается — это прикидка,
// и её можно крутить сколько угодно.
//
// Чистые функции: экран пересчитывает ответ на каждое нажатие клавиши.

export type WhatIfBase = {
  currency: string;
  /** Наличные и карты — то, с чего платят. */
  liquid: number;
  /** Накопительные счета — подушка. */
  savings: number;
  avgIncome: number;
  avgExpense: number;
  /** Платежи по долгам в месяц, уже идущие. */
  debtPayments: number;
  /** Сколько месяцев подушки человек себе поставил целью. */
  cushionTarget: number;
  goals: Array<{
    id: string;
    title: string;
    target: number;
    saved: number;
    /** Сколько человек откладывает на цель в месяц. */
    monthly: number;
  }>;
};

export type WhatIfScenario = {
  amount: number;
  mode: "cash" | "credit";
  /** Откуда платить сразу: со счетов или из подушки. */
  from: "liquid" | "savings";
  /** Кредит или рассрочка. */
  months: number;
  ratePercent: number;
  downPayment: number;
};

export type GoalOutlook = {
  id: string;
  title: string;
  /** Месяцев до цели; null — при таком темпе не дойти никогда. */
  before: number | null;
  after: number | null;
};

export type WhatIfResult = {
  monthlyPayment: number;
  overpayment: number;
  cushionBefore: number;
  cushionAfter: number;
  freeBefore: number;
  freeAfter: number;
  /** Все деньги (счета + подушка) по месяцам на год вперёд; [0] — сегодня. */
  pathBefore: number[];
  pathAfter: number[];
  goals: GoalOutlook[];
  verdict: "ok" | "tight" | "danger";
  /** Почему такой ответ — ключи словаря с подстановками. */
  reasons: Array<{ key: string; vars?: Record<string, string | number> }>;
};

const round = (value: number) => Math.round(value * 100) / 100;

/** Платёж по кредиту: аннуитет; без процентов — сумма поровну. */
export function annuity(principal: number, months: number, ratePercent: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const monthly = ratePercent / 100 / 12;
  if (monthly <= 0) return round(principal / months);
  const factor = Math.pow(1 + monthly, months);
  return round((principal * monthly * factor) / (factor - 1));
}

/** Месяцев до цели при взносе `monthly`; null — не дойти. */
function monthsToGoal(target: number, saved: number, monthly: number): number | null {
  const left = target - saved;
  if (left <= 0) return 0;
  if (monthly <= 0) return null;
  return Math.ceil(left / monthly);
}

const HORIZON = 12;

export function simulate(base: WhatIfBase, scenario: WhatIfScenario): WhatIfResult {
  const amount = Math.max(0, scenario.amount);
  const credit = scenario.mode === "credit";
  const down = credit ? Math.min(amount, Math.max(0, scenario.downPayment)) : 0;
  const months = Math.max(1, Math.round(scenario.months));
  const payment = credit ? annuity(amount - down, months, scenario.ratePercent) : 0;
  const overpayment = credit ? round(payment * months - (amount - down)) : 0;

  const freeBefore = round(base.avgIncome - base.avgExpense - base.debtPayments);
  const freeAfter = round(freeBefore - payment);

  // Сразу платят со счетов или из подушки; первый взнос по кредиту — со счетов.
  const upfront = credit ? down : amount;
  const fromSavings = !credit && scenario.from === "savings";
  const savingsAfter = fromSavings ? base.savings - upfront : base.savings;
  const perMonth = base.avgExpense + base.debtPayments;
  const cushion = (money: number, monthly: number) => (monthly > 0 ? round(money / monthly) : 0);
  const cushionBefore = cushion(base.savings, perMonth);
  // С кредитом каждый месяц уходит больше — подушка того же размера покрывает
  // меньше месяцев.
  const cushionAfter = cushion(Math.max(0, savingsAfter), perMonth + payment);

  const start = base.liquid + base.savings;
  const pathBefore: number[] = [];
  const pathAfter: number[] = [];
  for (let month = 0; month <= HORIZON; month += 1) {
    pathBefore.push(round(start + freeBefore * month));
    const paid = credit ? Math.min(month, months) * payment : 0;
    pathAfter.push(round(start - upfront + freeBefore * month - paid));
  }

  // На цели идёт то, что остаётся; не хватает — взносы урезаются поровну. И до
  // покупки тоже: если свободных денег и сейчас меньше взносов, «до» считается с
  // тем же урезанием — иначе покупка, которая ничего в месяц не меняет, выглядела
  // бы так, будто отодвигает цели.
  const planned = base.goals.reduce((sum, goal) => sum + Math.max(0, goal.monthly), 0);
  const scaleOf = (free: number) =>
    planned > 0 && free < planned ? Math.max(0, free) / planned : planned > 0 ? 1 : 0;
  const scaleBefore = scaleOf(freeBefore);
  const scaleAfter = scaleOf(freeAfter);
  const goals = base.goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    before: monthsToGoal(goal.target, goal.saved, goal.monthly * scaleBefore),
    after: monthsToGoal(goal.target, goal.saved, goal.monthly * scaleAfter)
  }));

  const reasons: WhatIfResult["reasons"] = [];
  let verdict: WhatIfResult["verdict"] = "ok";
  if (!fromSavings && upfront > base.liquid) {
    verdict = "danger";
    reasons.push({ key: "wi.reason.noCash", vars: { short: round(upfront - base.liquid) } });
  }
  if (fromSavings && upfront > base.savings) {
    verdict = "danger";
    reasons.push({ key: "wi.reason.noSavings", vars: { short: round(upfront - base.savings) } });
  }
  if (freeAfter < 0) {
    verdict = "danger";
    reasons.push({ key: "wi.reason.negative", vars: { gap: round(-freeAfter) } });
  }
  if (verdict !== "danger" && cushionAfter < base.cushionTarget && cushionAfter < cushionBefore) {
    verdict = "tight";
    reasons.push({
      key: "wi.reason.cushion",
      vars: { months: cushionAfter.toFixed(1), target: base.cushionTarget }
    });
  }
  const slowed = goals.filter(
    (goal) => goal.before !== null && (goal.after === null || goal.after > goal.before)
  );
  if (verdict === "ok" && slowed.length > 0) {
    verdict = "tight";
    reasons.push({ key: "wi.reason.goals", vars: { count: slowed.length } });
  }
  if (reasons.length === 0) reasons.push({ key: "wi.reason.ok" });

  return {
    monthlyPayment: payment,
    overpayment,
    cushionBefore,
    cushionAfter,
    freeBefore,
    freeAfter,
    pathBefore,
    pathAfter,
    goals,
    verdict,
    reasons
  };
}
