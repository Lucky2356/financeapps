// Шаблоны новой таблицы: готовый набор столбцов под частую задачу.
//
// Мастер создания по умолчанию собирает статьи из своих категорий учёта. Но
// таблицу заводят и под другое — ремонт, отпуск, — и там категорий учёта нет:
// человек сидел перед пустым списком и придумывал названия столбцов сам.
// Шаблон даёт осмысленные названия и правильные виды столбцов сразу; статьи
// в мастере всё равно можно снять, а суммы — вписать.
//
// Названия столбцов — по-русски и в английском интерфейсе тоже: это данные
// таблицы, как «Остаток» и «Доходы» у пустого листа.

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
  { name: "Остаток", kind: "opening" },
  { name: "Доходы", kind: "income" }
];

const CUSHION: TemplateColumn[] = [
  { name: "Подушка на начало", kind: "savingsOpening" },
  { name: "В сбережения", kind: "toSavings" }
];

export const SHEET_TEMPLATES: Record<SheetTemplateId, SheetTemplate> = {
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
      { name: "Остаток", kind: "opening" },
      { name: "Зарплата", kind: "income" },
      { name: "Прочие доходы", kind: "income" }
    ],
    articles: [
      "Продукты",
      "Жильё и ЖКХ",
      "Транспорт",
      "Дети",
      "Здоровье",
      "Одежда",
      "Связь и интернет",
      "Кафе и развлечения",
      "Подарки"
    ],
    tail: [{ name: "Заметки", kind: "note" }],
    savings: [...CUSHION, { name: "Проценты по вкладу", kind: "savingsIncome" }],
    savingsByDefault: true,
    months: 12
  },
  renovation: {
    id: "renovation",
    lead: [
      { name: "Отложено на ремонт", kind: "opening" },
      { name: "Откладываю в месяц", kind: "income" }
    ],
    articles: [
      "Черновые материалы",
      "Чистовые материалы",
      "Работа мастеров",
      "Сантехника и электрика",
      "Мебель",
      "Техника",
      "Доставка и вывоз мусора",
      "Непредвиденное"
    ],
    tail: [{ name: "Что сделано", kind: "note" }],
    savings: CUSHION,
    savingsByDefault: false,
    months: 6
  },
  vacation: {
    id: "vacation",
    lead: [
      { name: "Накоплено на отпуск", kind: "opening" },
      { name: "Откладываю в месяц", kind: "income" }
    ],
    articles: [
      "Билеты",
      "Жильё",
      "Питание",
      "Транспорт на месте",
      "Экскурсии и развлечения",
      "Страховка и визы",
      "Покупки и сувениры"
    ],
    tail: [{ name: "Заметки", kind: "note" }],
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

/** Шаблон по имени из запроса; незнакомое имя — null. */
export function sheetTemplate(id: unknown): SheetTemplate | null {
  return SHEET_TEMPLATE_IDS.includes(id as SheetTemplateId)
    ? SHEET_TEMPLATES[id as SheetTemplateId]
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
  return categories.find((category) => stem(category.label) === wanted) ?? null;
}
