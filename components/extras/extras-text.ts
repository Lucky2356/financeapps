"use client";

// Слова экранов «Кэшбэк», «Поездки» и «Вычеты». Свой словарь рядом с экранами,
// как у «Таблицы»: слов много, и живут они только здесь.

import { useI18n } from "@/lib/i18n/context";
import type { DeductionKind } from "@/lib/tax/deductions";

const RU = {
  prevMonth: "Предыдущий месяц",
  nextMonth: "Следующий месяц",
  // кэшбэк
  cbEarned: "Пришло кэшбэка",
  cbMissed: "Упущено",
  cbMissedHint: "Платили не той картой: «{category}» — выгоднее «{card}», потеряно {amount}",
  cbNoRules: "Условий на этот месяц нет",
  cbNoRulesHint:
    "Банки дают выбрать категории кэшбэка каждый месяц. Запишите их — и при записи траты приложение подскажет, какой картой платить.",
  cbCopy: "Скопировать с прошлого месяца",
  cbCopied: "Скопировано условий: {count}",
  cbAdd: "Добавить условие",
  cbCard: "Карта",
  cbCategory: "Категория",
  cbAny: "На всё остальное",
  cbPercent: "Кэшбэк, %",
  cbLimit: "Лимит в месяц, ₽",
  cbLimitHint: "Пусто — без лимита.",
  cbSave: "Сохранить",
  cbSaved: "Условие сохранено.",
  cbRemove: "Убрать",
  cbBest: "Лучшая карта по категориям",
  cbUpTo: "до {limit}",
  // поездки
  trNone: "Поездок пока нет",
  trNoneHint:
    "Заведите поездку — и пока она идёт, каждая трата сама получит её метку. Здесь будет видно, сколько ушло из бюджета и сколько можно в день.",
  trAdd: "Новая поездка",
  trEdit: "Поездка",
  trName: "Куда",
  trFrom: "С",
  trTo: "По",
  trBudget: "Бюджет",
  trCurrency: "Валюта",
  trSave: "Сохранить",
  trSaved: "Поездка сохранена.",
  trRemove: "Удалить поездку",
  trRemoveHint: "Операции останутся, у них останется и метка.",
  trFinish: "Закончить сегодня",
  trActive: "идёт",
  trDone: "прошла",
  trSoon: "впереди",
  trSpent: "Потрачено {spent} из {budget}",
  trSpentNoBudget: "Потрачено {spent}",
  trLeft: "Осталось {left} · {days} дн.",
  trPerDay: "Можно в день: {amount}",
  trOver: "Сверх бюджета на {amount}",
  trOps: "Операции поездки",
  trDays: "{days} дн.",
  // вычеты
  dYear: "Год",
  dRefund: "Можно вернуть",
  dRefundHint: "13 % от учтённых трат, не больше уплаченного НДФЛ.",
  dPossible: "по тратам — {amount}, но налога уплачено {tax}",
  dTaxPaid: "Уплачено НДФЛ за год",
  dTaxEstimated: "оценка по зарплате — впишите точную цифру из справки 2-НДФЛ",
  dTaxUnknown: "Неизвестно — впишите из справки о доходах",
  dChildren: "Сколько детей учится",
  dSaveYear: "Сохранить",
  dSaved: "Сохранено.",
  dLines: "По видам",
  dSpent: "потрачено {spent}",
  dLimit: "лимит {limit}",
  dNoLimit: "без лимита",
  dCategories: "Какие категории идут в вычет",
  dCategoriesHint: "Отметьте вид вычета у категории — её траты попадут сюда за все годы.",
  dNotDeductible: "не в вычет",
  dOperations: "Операции для декларации",
  dNoOperations: "За этот год трат в вычет нет. Отметьте категории выше.",
  dExport: "Выгрузить для декларации",
  dExported: "Файл сохранён.",
  dNote:
    "Ставка 13 %; с дохода свыше 5 млн — 15 %, здесь это не учитывается. Вернуть можно за три последних года.",
  group: {
    SOCIAL: "Лечение, обучение, спорт",
    EXPENSIVE_MEDICAL: "Дорогостоящее лечение",
    CHILD_EDUCATION: "Обучение детей",
    IIS: "Взносы на ИИС"
  },
  kind: {
    MEDICAL: "Лечение и лекарства",
    EXPENSIVE_MEDICAL: "Дорогостоящее лечение",
    EDUCATION: "Своё обучение",
    SPORT: "Спорт",
    CHILD_EDUCATION: "Обучение детей",
    IIS: "Взнос на ИИС"
  } satisfies Record<DeductionKind, string>
};

type Text = typeof RU;

const EN: Text = {
  prevMonth: "Previous month",
  nextMonth: "Next month",
  cbEarned: "Cashback earned",
  cbMissed: "Missed",
  cbMissedHint: "Paid with the wrong card: “{category}” — “{card}” pays more, lost {amount}",
  cbNoRules: "No terms for this month",
  cbNoRulesHint:
    "Banks let you pick bonus categories every month. Record them and the app will suggest which card to pay with.",
  cbCopy: "Copy from last month",
  cbCopied: "Terms copied: {count}",
  cbAdd: "Add terms",
  cbCard: "Card",
  cbCategory: "Category",
  cbAny: "Everything else",
  cbPercent: "Cashback, %",
  cbLimit: "Monthly cap",
  cbLimitHint: "Empty — no cap.",
  cbSave: "Save",
  cbSaved: "Saved.",
  cbRemove: "Remove",
  cbBest: "Best card by category",
  cbUpTo: "up to {limit}",
  trNone: "No trips yet",
  trNoneHint:
    "Create a trip — while it is on, every expense gets its tag automatically. You will see how much of the budget went and how much is left per day.",
  trAdd: "New trip",
  trEdit: "Trip",
  trName: "Where",
  trFrom: "From",
  trTo: "To",
  trBudget: "Budget",
  trCurrency: "Currency",
  trSave: "Save",
  trSaved: "Trip saved.",
  trRemove: "Delete trip",
  trRemoveHint: "Operations stay, and so does their tag.",
  trFinish: "Finish today",
  trActive: "on",
  trDone: "over",
  trSoon: "ahead",
  trSpent: "Spent {spent} of {budget}",
  trSpentNoBudget: "Spent {spent}",
  trLeft: "{left} left · {days} days",
  trPerDay: "Per day: {amount}",
  trOver: "Over budget by {amount}",
  trOps: "Trip operations",
  trDays: "{days} days",
  dYear: "Year",
  dRefund: "Refund available",
  dRefundHint: "13% of the counted spending, no more than the income tax paid.",
  dPossible: "spending allows {amount}, but only {tax} tax was paid",
  dTaxPaid: "Income tax paid this year",
  dTaxEstimated: "estimated from salary — enter the exact figure from your tax statement",
  dTaxUnknown: "Unknown — enter it from your income statement",
  dChildren: "Children in education",
  dSaveYear: "Save",
  dSaved: "Saved.",
  dLines: "By kind",
  dSpent: "spent {spent}",
  dLimit: "limit {limit}",
  dNoLimit: "no limit",
  dCategories: "Which categories qualify",
  dCategoriesHint:
    "Pick a deduction kind for a category — its spending is counted here for every year.",
  dNotDeductible: "not deductible",
  dOperations: "Operations for the tax return",
  dNoOperations: "No qualifying spending this year. Mark the categories above.",
  dExport: "Export for the tax return",
  dExported: "File saved.",
  dNote:
    "Rate 13%; 15% above 5 million income is not accounted for. Refunds can be claimed for the last three years.",
  group: {
    SOCIAL: "Medical, education, sport",
    EXPENSIVE_MEDICAL: "Expensive treatment",
    CHILD_EDUCATION: "Children's education",
    IIS: "IIS contributions"
  },
  kind: {
    MEDICAL: "Medical and medicines",
    EXPENSIVE_MEDICAL: "Expensive treatment",
    EDUCATION: "Own education",
    SPORT: "Sport",
    CHILD_EDUCATION: "Children's education",
    IIS: "IIS contribution"
  }
};

export function useExtrasText() {
  const { locale } = useI18n();
  const words = locale === "en" ? EN : RU;
  const format = (template: string, values: Record<string, string | number> = {}) =>
    template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
  return { words, format, locale };
}

/** Месяц на шаг вперёд или назад: «2026-09» ± 1. */
export function shiftMonth(month: string, step: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1 + step, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
