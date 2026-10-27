// Встроенный пример: счета, операции, лимиты, цели и портфель, которыми
// заполняется профиль-пример по кнопке «Загрузить пример».

import { sortLots, summarizeLots } from "@/lib/investments/lots";
import { roundMoney } from "@/lib/utils";
import { isoDay } from "@/lib/net-worth-snapshots";
import {
  SAMPLE_BUDGETS,
  SAMPLE_DIVIDEND,
  SAMPLE_PORTFOLIO,
  sampleSecurityName,
  sampleDataset,
  sampleDate,
  sampleDeadline
} from "@/lib/sample-data";
import type { Locale } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import {
  currency,
  type CategoryOption,
  type LocalState,
  recomputeGoal,
  createInitialState
} from "@/lib/api/local/state";
import { buildBudgetRow } from "@/lib/api/local/budgets";

// Builds a fully-populated example state (accounts, categories, transactions,
// budgets, goals) from the shared sample dataset, so a new user can explore a
// realistic app in one click.
//
// На языке интерфейса: человек с английским интерфейсом смотрит пример по-
// английски. Пример — это его данные на время знакомства, и после загрузки
// они не переводятся, как и любые другие.
export function buildSampleState(locale: Locale = getClientLocale()): LocalState {
  const sample = sampleDataset(locale);
  const accounts = sample.accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    balance: account.balance,
    currency
  }));
  const categories: CategoryOption[] = sample.categories.map((category) => ({
    id: category.id,
    label: category.label,
    kind: category.kind,
    color: category.color,
    ...(category.isEssential ? { isEssential: true } : {}),
    ...(category.isSubscription ? { isSubscription: true } : {})
  }));
  const transactions = sample.transactions.map((tx, index) => {
    const account = accounts.find((item) => item.id === tx.accountId)!;
    const category = categories.find((item) => item.id === tx.categoryId)!;
    return {
      id: `sample-tx-${index}`,
      amount: tx.amount,
      type: tx.type,
      date: sampleDate(tx.monthOffset, tx.day).toISOString(),
      description: tx.description,
      account: { id: account.id, label: account.name },
      category: { id: category.id, label: category.label, color: category.color }
    };
  });
  const goals = sample.goals.map((goal) =>
    recomputeGoal({
      id: goal.id,
      title: goal.title,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      deadline: sampleDeadline(goal.monthsToDeadline).toISOString()
    })
  );

  const state: LocalState = {
    ...createInitialState(),
    accounts,
    categories,
    transactions,
    goals
  };
  state.budgets = SAMPLE_BUDGETS.map((budget) => {
    const category = categories.find((item) => item.id === budget.categoryId);
    return category ? buildBudgetRow(state, category, budget.limitAmount) : null;
  }).filter((row): row is NonNullable<typeof row> => row !== null);
  // Портфель примера: покупки лотами, цены обновятся с биржи при открытии.
  state.investments.portfolio = SAMPLE_PORTFOLIO.map((position) => {
    const lots = position.lots.map((lot) => ({
      date: isoDay(sampleDate(-lot.monthsAgo, 10)),
      quantity: lot.quantity,
      price: lot.price
    }));
    const summary = summarizeLots(lots);
    const price = lots[lots.length - 1].price;
    return {
      ticker: position.ticker,
      name: sampleSecurityName(position.ticker, position.name, locale),
      assetKind: "STOCK" as const,
      sector: position.sector,
      quantity: summary.quantity,
      averageBuyPrice: summary.averageBuyPrice,
      currentPrice: price,
      currentValue: roundMoney(price * summary.quantity),
      pnl: roundMoney((price - summary.averageBuyPrice) * summary.quantity),
      share: 0,
      risk: position.risk,
      lots: sortLots(lots)
    };
  });
  state.realizedInvestmentEvents = [
    {
      id: "sample-dividend",
      type: "DIVIDEND",
      ticker: SAMPLE_DIVIDEND.ticker,
      name: sampleSecurityName(SAMPLE_DIVIDEND.ticker, SAMPLE_DIVIDEND.name, locale),
      date: isoDay(sampleDate(-SAMPLE_DIVIDEND.monthsAgo, 18)),
      quantity: 0,
      sellPrice: 0,
      buyPrice: 0,
      amount: SAMPLE_DIVIDEND.amount,
      fee: 0,
      currency: state.currency
    }
  ];
  return state;
}
