/**
 * Житейские настройки этого устройства.
 *
 * Они про то, КАК смотреть на деньги, а не про сами деньги: скрыть суммы в
 * метро, видеть копейки, читать крупнее, открывать приложение сразу на нужном
 * экране. Поэтому лежат в localStorage, рядом с плотностью и языком, и не
 * ездят на другие устройства: на телефоне человек прячет суммы, а дома за
 * компьютером — нет.
 *
 * Сумма форматируется в сотне мест, и прокидывать туда «скрыто ли» было бы
 * сотней мест, где это однажды забудут. Поэтому флаги живут здесь, модулем, и
 * их читает сам formatCurrency. Экраны с деньгами рисуются только за воротами
 * замка, то есть уже в браузере, после оживления страницы, — так что прочитать
 * localStorage при загрузке модуля безопасно: заранее собранная страница сумм
 * не содержит, расходиться не с чем.
 */

export const HIDE_AMOUNTS_KEY = "hide-amounts";
export const SHOW_KOPECKS_KEY = "show-kopecks";
export const TEXT_SIZE_KEY = "text-size";
export const START_SCREEN_KEY = "start-screen";

/** Разослать, когда настройка вида поменялась: экраны перерисуются. */
export const PREFERENCES_CHANGED = "preferences-changed";

export const START_SCREENS = ["/", "/transactions", "/budgets", "/plan", "/investments"] as const;
export type StartScreen = (typeof START_SCREENS)[number];

export type TextSize = "normal" | "large";

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно — настройка проживёт до перезапуска */
  }
}

let amountsHidden = read(HIDE_AMOUNTS_KEY) === "1";
let kopecksShown = read(SHOW_KOPECKS_KEY) === "1";

export function areAmountsHidden(): boolean {
  return amountsHidden;
}

export function areKopecksShown(): boolean {
  return kopecksShown;
}

function announce(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PREFERENCES_CHANGED));
}

export function setAmountsHidden(hidden: boolean): void {
  amountsHidden = hidden;
  write(HIDE_AMOUNTS_KEY, hidden ? "1" : null);
  announce();
}

export function setKopecksShown(shown: boolean): void {
  kopecksShown = shown;
  write(SHOW_KOPECKS_KEY, shown ? "1" : null);
  announce();
}

export function readTextSize(): TextSize {
  return read(TEXT_SIZE_KEY) === "large" ? "large" : "normal";
}

export function setTextSize(size: TextSize): void {
  write(TEXT_SIZE_KEY, size === "large" ? "large" : null);
  if (typeof document !== "undefined") {
    if (size === "large") document.documentElement.setAttribute("data-text", "large");
    else document.documentElement.removeAttribute("data-text");
  }
}

export function readStartScreen(): StartScreen {
  const stored = read(START_SCREEN_KEY);
  return (START_SCREENS as readonly string[]).includes(stored ?? "")
    ? (stored as StartScreen)
    : "/";
}

export function setStartScreen(screen: StartScreen): void {
  write(START_SCREEN_KEY, screen === "/" ? null : screen);
}
