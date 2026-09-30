// Поиск в «Учёте» понимает не только слова, но и суммы.
//
//   кофе            — слово: в описании, счёте, категории или метке
//   5000            — сумма ровно 5000 (или слово «5000», если оно есть в тексте)
//   >5000  <=300    — больше, меньше (и «или равно»)
//   1000-3000       — от и до
//   5к  2,5к        — тысячи
//   кофе >300       — всё вместе: слова и условия по сумме должны сойтись
//
// Раньше строка искалась целиком как кусок текста, и «5000» не находила
// операцию на 5 000 ₽, если этого числа нет в описании: приходилось открывать
// «Фильтры» и вписывать сумму в два поля.

type AmountTest = (amount: number) => boolean;

type Parsed = {
  /** Слова: каждое должно найтись в тексте (или, если это число, — в сумме). */
  words: Array<{ text: string; amount: number | null }>;
  /** Условия по сумме: >, <, диапазон. Все должны выполняться. */
  tests: AmountTest[];
};

const NUMBER = "(\\d+(?:[.,]\\d+)?)\\s*(к|k|тыс)?";

function toNumber(digits: string, suffix?: string): number {
  const value = Number(digits.replace(",", "."));
  return suffix ? value * 1000 : value;
}

/** «5 000» → «5000», «> 300» → «>300»: пробелы внутри числа и после знака не разделяют слова. */
function tidy(raw: string): string {
  let text = raw.toLowerCase().trim();
  let previous = "";
  while (previous !== text) {
    previous = text;
    text = text.replace(/(\d)[\s ](\d{3})(?!\d)/g, "$1$2");
  }
  return text
    .replace(/([<>]=?|≥|≤)\s+(?=\d)/g, "$1")
    .replace(/(\d(?:к|k|тыс)?)\s*[-–—]\s*(?=\d)/g, "$1-");
}

export function parseSearch(query: string): Parsed {
  const parsed: Parsed = { words: [], tests: [] };
  for (const token of tidy(query).split(/\s+/).filter(Boolean)) {
    const compare = new RegExp(`^(>=|<=|>|<|≥|≤)${NUMBER}$`).exec(token);
    if (compare) {
      const limit = toNumber(compare[2], compare[3]);
      const operator = compare[1];
      parsed.tests.push((amount) =>
        operator === ">"
          ? amount > limit
          : operator === "<"
            ? amount < limit
            : operator === ">=" || operator === "≥"
              ? amount >= limit
              : amount <= limit
      );
      continue;
    }
    const range = new RegExp(`^${NUMBER}-${NUMBER}$`).exec(token);
    if (range) {
      const low = toNumber(range[1], range[2]);
      const high = toNumber(range[3], range[4]);
      const [from, to] = low <= high ? [low, high] : [high, low];
      parsed.tests.push((amount) => amount >= from && amount <= to);
      continue;
    }
    const plain = new RegExp(`^${NUMBER}$`).exec(token);
    parsed.words.push({ text: token, amount: plain ? toNumber(plain[1], plain[2]) : null });
  }
  return parsed;
}

/**
 * Подходит ли операция под строку поиска.
 * `haystack` — уже приведённый к нижнему регистру текст операции.
 */
export function matchesSearch(query: string, haystack: string, amount: number): boolean {
  const { words, tests } = parseSearch(query);
  if (!tests.every((test) => test(amount))) return false;
  return words.every(
    (word) =>
      haystack.includes(word.text) ||
      (word.amount !== null && Math.abs(word.amount - amount) < 0.005)
  );
}
