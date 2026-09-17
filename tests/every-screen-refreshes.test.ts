import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Сторож: экран, читающий книгу, обязан её и перечитывать.
//
// Книга меняется не только рукой человека. Её приносит синхронизация с другого
// устройства — и кладёт прямо в хранилище, ниже приложения. Место, прочитавшее
// свои числа один раз при открытии, остаётся с ними навсегда: человек видит на
// одном экране одни суммы, на другом — другие, и обе прочитаны из одной книги.
//
// Найдено на живой паре устройств: синхронизация уже поднимала экраны, читавшие
// через useApiPageData, а разделы со своим запросом — аналитика, отчёты,
// прогноз, правила, колокольчик — оставались вчерашними. Проверок на это не
// было ни одной: каждый такой раздел писался отдельно и подписаться забывал
// тоже отдельно.
//
// Поэтому сторож смотрит на ИСХОДНИК, а не на поведение. Поведение каждого из
// двадцати разделов пришлось бы проверять двадцатью проверками, и двадцать
// первый так же тихо остался бы без своей.

const ROOTS = ["components", "app", "hooks"];

/** Как место может узнать, что книга изменилась. Любого из трёх достаточно. */
const SUBSCRIPTIONS = ["useApiPageData", "onDataChanged", "useDataVersion"];

/**
 * Места, которые читают по требованию, а не показывают книгу.
 *
 * Каждое — с причиной. Читают они в ответ на действие человека (нажал кнопку,
 * открыл окно, начал искать), и к моменту чтения книга уже свежая. Подписка тут
 * не нужна и была бы вредна: лишние запросы к бирже и к языковой модели стоят
 * денег и времени.
 *
 * Список закрытый. Добавить сюда новое место можно, но придётся написать здесь
 * же, почему оно читает по требованию, — а это ровно тот вопрос, который стоит
 * задать себе, заводя такое место.
 */
const ON_DEMAND: Record<string, string> = {
  "components/ai/ai-budget-plan-card.tsx": "спрашивает модель по нажатию кнопки",
  "components/ai/ai-goal-plan-button.tsx": "спрашивает модель по нажатию кнопки",
  "components/ai/ai-quick-add.tsx": "разбирает строку, введённую человеком",
  "components/ai/ai-review-card.tsx": "спрашивает модель по нажатию кнопки",
  "components/analytics/ai-insight-panel.tsx": "спрашивает модель по нажатию кнопки",
  "components/automation-runner.tsx": "фоновый прогон при загрузке, не экран",
  "components/command-palette.tsx": "читает при открытии палитры",
  "components/dashboard/distribute-cashflow.tsx": "читает при открытии окна (зависимость open)",
  "components/drilldown/amount-drilldown.tsx": "читает при раскрытии суммы",
  "components/investments/inline-stock-chart.tsx": "котировки с биржи, а не книга",
  "components/investments/security-search.tsx": "поиск бумаги по набранному"
};

/**
 * Путь — всегда с прямым слэшем, на любой системе.
 *
 * join даёт «components\\ai\\карточка.tsx» на Windows и
 * «components/ai/карточка.tsx» на остальных. Список исключений выше написан
 * прямыми слэшами, и без приведения сторож краснел ровно на одной системе из
 * двух: локально всё сходилось, а сборка под Windows падала на всех одиннадцати
 * строках списка разом. Обидно вдвойне: сторож написан ради того, чтобы всё
 * работало одинаково везде, — и сам работал по-разному.
 *
 * Заменяется именно обратный слэш, а не системный разделитель. Через разделитель
 * было бы «правильнее», но на Linux он и так прямой — то есть приведение стало
 * бы пустым действием, и проверить его здесь было бы нельзя. А проверять
 * починку на той самой системе, где поломки не видно, мы сегодня уже пробовали.
 */
export function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = toPosix(join(dir, entry));
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("каждый экран перечитывает себя", () => {
  it("путь приводится к прямому слэшу на любой системе", () => {
    // Эта проверка и есть починка той поломки, что уронила сборку 1.39.0.
    // Она краснеет на Linux, если приведение убрать, — то есть видна там, где
    // её пишут, а не только на Windows через двадцать минут сборки.
    expect(toPosix("components\\ai\\ai-quick-add.tsx")).toBe("components/ai/ai-quick-add.tsx");
    expect(toPosix("components/ai/ai-quick-add.tsx")).toBe("components/ai/ai-quick-add.tsx");
  });

  it("читающий книгу либо подписан, либо назван читающим по требованию", () => {
    const unsubscribed: string[] = [];

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const source = readFileSync(file, "utf8");
        if (!source.includes("apiClient.get")) continue;
        if (SUBSCRIPTIONS.some((mark) => source.includes(mark))) continue;
        unsubscribed.push(file);
      }
    }

    const unexplained = unsubscribed.filter((file) => !(file in ON_DEMAND));

    expect(unexplained, "читают книгу и не узнают о её изменении").toEqual([]);
  });

  it("список читающих по требованию не протух", () => {
    // Список, переживший удаление файла или его подписку, тихо разрешает то,
    // чего давно нет, — и однажды разрешит совсем другое место с тем же именем.
    const stale = Object.keys(ON_DEMAND).filter((file) => {
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        return true; // файла больше нет
      }
      if (!source.includes("apiClient.get")) return true; // больше не читает
      return SUBSCRIPTIONS.some((mark) => source.includes(mark)); // уже подписан
    });

    expect(stale, "лишние строки в списке читающих по требованию").toEqual([]);
  });
});
