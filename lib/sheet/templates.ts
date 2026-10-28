// Шаблоны новой таблицы: готовый набор столбцов под частую задачу.
//
// Мастер создания по умолчанию собирает статьи из своих категорий учёта. Но
// таблицу заводят и под другое — ремонт, отпуск, — и там категорий учёта нет:
// человек сидел перед пустым списком и придумывал названия столбцов сам.
// Шаблон даёт осмысленные названия и правильные виды столбцов сразу; статьи
// в мастере всё равно можно снять, а суммы — вписать.
//
// Названия столбцов и статей — на языке интерфейса в минуту создания: это
// данные таблицы, как «Остаток» и «Доходы» у пустого листа, и после создания
// они принадлежат человеку. Шаблон хранит ключи словаря данных, а не слова.

import type { Locale } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import { displayLocale } from "@/lib/i18n/display-locale";
import { dataKeyOf, dataText, dataVariants } from "@/lib/i18n/data-text";
import type { SheetColumnKind } from "@/lib/sheet/model";

export const SHEET_TEMPLATE_IDS = [
  "categories",
  "family",
  "renovation",
  "vacation",
  "blank"
] as const;

export type SheetTemplateId = (typeof SHEET_TEMPLATE_IDS)[number];

export type TemplateColumn = { name: string; kind: SheetColumnKind };

export type SheetTemplate = {
  id: SheetTemplateId;
  /** Столбцы перед статьями: остаток и доходы. */
  lead: TemplateColumn[];
  /**
   * Статьи расходов — их человек отмечает в мастере. У шаблона «categories»
   * пусто: статьи — его категории учёта.
   */
  articles: string[];
  /** Столбцы после статей — заметка к месяцу. */
  tail: TemplateColumn[];
  /** Раздел сбережений, если человек его ведёт. */
  savings: TemplateColumn[];
  /** Вести ли сбережения, пока человек не решил сам. */
  savingsByDefault: boolean;
  /** Сколько месяцев предложить. Ремонт и отпуск — короткие задачи. */
  months: number;
};

const BASIC_LEAD: TemplateColumn[] = [
  { name: "data.sheet.col.opening", kind: "opening" },
  { name: "data.sheet.col.income", kind: "income" }
];

const CUSHION: TemplateColumn[] = [
  { name: "data.sheet.col.cushionOpening", kind: "savingsOpening" },
  { name: "data.sheet.col.toSavings", kind: "toSavings" }
];

/** Шаблоны с ключами словаря данных вместо названий — см. sheetTemplates. */
const TEMPLATE_KEYS: Record<SheetTemplateId, SheetTemplate> = {
  categories: {
    id: "categories",
    lead: BASIC_LEAD,
    articles: [],
    tail: [],
    savings: CUSHION,
    savingsByDefault: true,
    months: 12
  },
  family: {
    id: "family",
    lead: [
      { name: "data.sheet.col.opening", kind: "opening" },
      { name: "data.sheet.col.salary", kind: "income" },
      { name: "data.sheet.col.otherIncome", kind: "income" }
    ],
    articles: [
      "data.sheet.art.food",
      "data.sheet.art.housing",
      "data.sheet.art.transport",
      "data.sheet.art.kids",
      "data.sheet.art.health",
      "data.sheet.art.clothes",
      "data.sheet.art.phone",
      "data.sheet.art.fun",
      "data.sheet.art.gifts"
    ],
    tail: [{ name: "data.sheet.col.notes", kind: "note" }],
    savings: [...CUSHION, { name: "data.sheet.col.depositInterest", kind: "savingsIncome" }],
    savingsByDefault: true,
    months: 12
  },
  renovation: {
    id: "renovation",
    lead: [
      { name: "data.sheet.col.renovationSaved", kind: "opening" },
      { name: "data.sheet.col.savePerMonth", kind: "income" }
    ],
    articles: [
      "data.sheet.art.roughMaterials",
      "data.sheet.art.finishMaterials",
      "data.sheet.art.labour",
      "data.sheet.art.plumbing",
      "data.sheet.art.furniture",
      "data.sheet.art.appliances",
      "data.sheet.art.delivery",
      "data.sheet.art.unexpected"
    ],
    tail: [{ name: "data.sheet.col.done", kind: "note" }],
    savings: CUSHION,
    savingsByDefault: false,
    months: 6
  },
  vacation: {
    id: "vacation",
    lead: [
      { name: "data.sheet.col.vacationSaved", kind: "opening" },
      { name: "data.sheet.col.savePerMonth", kind: "income" }
    ],
    articles: [
      "data.sheet.art.tickets",
      "data.sheet.art.lodging",
      "data.sheet.art.meals",
      "data.sheet.art.localTransport",
      "data.sheet.art.tours",
      "data.sheet.art.insurance",
      "data.sheet.art.souvenirs"
    ],
    tail: [{ name: "data.sheet.col.notes", kind: "note" }],
    savings: CUSHION,
    savingsByDefault: false,
    months: 6
  },
  blank: {
    id: "blank",
    lead: BASIC_LEAD,
    articles: [],
    tail: [],
    savings: CUSHION,
    savingsByDefault: true,
    months: 12
  }
};

function localize(template: SheetTemplate, locale: Locale): SheetTemplate {
  const columns = (list: TemplateColumn[]) =>
    list.map((column) => ({ ...column, name: dataText(column.name, locale) }));
  return {
    ...template,
    lead: columns(template.lead),
    articles: template.articles.map((key) => dataText(key, locale)),
    tail: columns(template.tail),
    savings: columns(template.savings)
  };
}

/** Все шаблоны с названиями на языке `locale`. */
export function sheetTemplates(locale: Locale): Record<SheetTemplateId, SheetTemplate> {
  return Object.fromEntries(
    SHEET_TEMPLATE_IDS.map((id) => [id, localize(TEMPLATE_KEYS[id], locale)])
  ) as Record<SheetTemplateId, SheetTemplate>;
}

/**
 * Шаблоны на языке экрана — для мастера, который их показывает. Каждое
 * обращение берёт язык заново: мастер открывается уже после того, как
 * интерфейс перешёл на выбранный язык (см. lib/i18n/display-locale.ts).
 */
export const SHEET_TEMPLATES = Object.defineProperties(
  {} as Record<SheetTemplateId, SheetTemplate>,
  Object.fromEntries(
    SHEET_TEMPLATE_IDS.map((id) => [
      id,
      { enumerable: true, get: () => localize(TEMPLATE_KEYS[id], displayLocale()) }
    ])
  )
);

/**
 * Шаблон по имени из запроса; незнакомое имя — null. Названия — на языке
 * интерфейса, как и всё, что API заводит в данные.
 */
export function sheetTemplate(
  id: unknown,
  locale: Locale = getClientLocale()
): SheetTemplate | null {
  return SHEET_TEMPLATE_IDS.includes(id as SheetTemplateId)
    ? localize(TEMPLATE_KEYS[id as SheetTemplateId], locale)
    : null;
}

const stem = (text: string) => text.trim().toLowerCase().replace(/ё/g, "е");

/**
 * Категория учёта для статьи шаблона — по совпадению названия («Продукты» ↔
 * «Продукты», «Жильё» ↔ «жилье»). Нашлась — название столбца открывает её
 * операции, как у статей из категорий. Не нашлась — столбец без категории.
 */
export function matchCategory<T extends { id: string; label: string }>(
  name: string,
  categories: readonly T[]
): T | null {
  const wanted = stem(name);
  const exact = categories.find((category) => stem(category.label) === wanted);
  if (exact) return exact;
  // Статья шаблона и категория на разных языках: «Groceries» из английского
  // мастера находит «Продукты», заведённые русским устройством, — по общему
  // ключу словаря данных.
  const key = dataKeyOf(name, "data.sheet.art.") ?? dataKeyOf(name, "data.cat.");
  if (!key) return null;
  const twin = key.startsWith("data.sheet.art.") ? `data.cat.${key.slice(15)}` : key;
  const variants = new Set([...dataVariants(key), ...dataVariants(twin)].map(stem));
  return categories.find((category) => variants.has(stem(category.label))) ?? null;
}
