// Какие разделы показывать в меню.
//
// В приложении два десятка экранов, и обычному человеку нужны пять: главная,
// учёт, счета, лимиты, цели. Инвестиции, кэшбэк, поездки, вычеты, таблица —
// для тех, кто этим пользуется; остальных они только путают. Здесь список того,
// что можно убрать из меню, и как это запоминается.
//
// Скрытый раздел никуда не девается: адрес открывается, поиск (Ctrl+K) его
// не показывает, а вернуть его — переключателем в настройках.

export type HideableSection = { href: string; labelKey: string };

/** Что можно убрать. Главная, учёт, счета, категории, лимиты и настройки — нельзя. */
export const HIDEABLE_SECTIONS: readonly HideableSection[] = [
  { href: "/investments", labelKey: "nav.investments" },
  { href: "/sheet", labelKey: "nav.sheet" },
  { href: "/goals", labelKey: "nav.goals" },
  { href: "/debts", labelKey: "nav.debts" },
  { href: "/subscriptions", labelKey: "nav.subscriptions" },
  { href: "/cashback", labelKey: "nav.cashback" },
  { href: "/trips", labelKey: "nav.trips" },
  { href: "/what-if", labelKey: "nav.whatIf" },
  { href: "/family", labelKey: "nav.family" },
  { href: "/deductions", labelKey: "nav.deductions" },
  { href: "/forecast", labelKey: "nav.forecast" },
  { href: "/reports", labelKey: "nav.reports" }
];

export const NAV_HIDDEN_KEY = "nav-hidden";
export const NAV_HIDDEN_EVENT = "nav-hidden-changed";

/**
 * Что спрятано у новичка: самые узкие разделы. Человек, который завёл пустую
 * книгу, первым делом видит два десятка пунктов меню, из которых ему нужны
 * пять, — и не понимает, с чего начать. Узкое — кэшбэк, поездки, «Что если»,
 * семья, вычеты — ждёт в настройках («Разделы меню») и включается одним
 * переключателем.
 *
 * Только для новой пустой книги (первый запуск, «Начать с нуля» или «Из
 * выписки»): у того, кто уже пользуется приложением, подключил устройство к
 * своим данным или вернул копию, меню не меняется.
 */
export const NEWCOMER_HIDDEN: readonly string[] = [
  "/cashback",
  "/trips",
  "/what-if",
  "/family",
  "/deductions"
];

/**
 * Меню новичка — если человек его ещё не настраивал (`saved` — сохранённое,
 * null — ничего). Настраивал — null: его выбор не трогаем.
 */
export function newcomerMenu(saved: string | null): string | null {
  return saved === null ? encodeHidden(new Set(NEWCOMER_HIDDEN)) : null;
}

const HIDEABLE = new Set(HIDEABLE_SECTIONS.map((section) => section.href));

/** Разобрать сохранённое; чужое и мусор отбрасываются — неубираемое не спрячешь. */
export function parseHidden(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(
      list.filter((item): item is string => typeof item === "string" && HIDEABLE.has(item))
    );
  } catch {
    return new Set();
  }
}

export function encodeHidden(hidden: ReadonlySet<string>): string {
  return JSON.stringify([...hidden].filter((href) => HIDEABLE.has(href)).sort());
}

/** Пункты меню без скрытых. */
export function visibleItems<T extends { href: string }>(
  items: readonly T[],
  hidden: ReadonlySet<string>
): T[] {
  return items.filter((item) => !hidden.has(item.href));
}
