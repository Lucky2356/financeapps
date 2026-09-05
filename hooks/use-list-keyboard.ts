"use client";

import { useState, type KeyboardEvent } from "react";

/**
 * «Печатаю — стрелками выбираю — Enter».
 *
 * Так устроен всякий поиск, которым пользуются часто: командная строка, адресная
 * строка браузера, поиск бумаг в банковском приложении. Руки не уходят с
 * клавиатуры, и выбор первой строки стоит одного нажатия.
 *
 * Заведено общим хуком, а не скопировано во второе место: механизм жил в
 * command-palette.tsx, и поиску бумаг нужен ровно он же. Две копии разошлись бы
 * на первой же правке — скажем, когда к стрелкам добавят Home/End.
 *
 * `resetKey` — то, при смене чего подсветка возвращается на первую строку
 * (обычно сам запрос): выдача стала другой, значит и «текущая» строка в ней
 * другая. Сделано присваиванием во время отрисовки, а не эффектом, чтобы не
 * было кадра со старой подсветкой на новом списке.
 */
export function useListKeyboard<T>(items: T[], onPick: (item: T) => void, resetKey: unknown) {
  const [activeIndex, setActiveIndex] = useState(0);

  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setActiveIndex(0);
  }

  // Список мог укоротиться под уже выбранным номером — тогда подсветка стоит на
  // пустом месте, и Enter не сделал бы ничего.
  const safeIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[safeIndex];
      if (item !== undefined) onPick(item);
    }
  }

  return { activeIndex: safeIndex, setActiveIndex, onKeyDown };
}
