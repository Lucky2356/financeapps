import type { Page } from "@playwright/test";

// Биржа для проверок — своя, а не настоящая.
//
// Раньше, если Мосбиржа не отвечала, приложение само подставляло учебные цены
// (MockMarketDataProvider) — и проверки поиска бумаг, докупки и «Против
// индекса» проходили на них, даже когда биржа из CI недоступна. Учебных цен
// без сети больше нет: настоящий портфель нельзя оценивать выдуманными
// котировками. Поэтому то, что проверке нужно от биржи, она получает здесь —
// ответами в формате MOEX ISS, на те же адреса, по которым ходит приложение.
// Проверяется код приложения, а не то, отвечает ли сегодня биржа.

/** Бумаги доски акций: тикер, короткое имя, цена. */
const SHARES: Array<[string, string, number]> = [
  ["SBER", "Сбербанк", 300],
  ["SBERP", "Сбербанк-п", 295],
  ["GAZP", "ГАЗПРОМ ао", 130],
  ["LKOH", "ЛУКОЙЛ", 6900],
  ["YDEX", "Яндекс", 4100],
  ["SNGS", "Сургнфгз", 24],
  ["SNGSP", "Сургнфгз-п", 55],
  ["VTBR", "ВТБ ао", 90],
  ["MGNT", "Магнит", 5200],
  ["T", "Т-Технологии", 3100]
];

/** Индексы — с доски индексов. */
const INDEXES: Record<string, number> = { IMOEX: 3000, MCFTR: 7000 };

const HISTORY_PAGE = 100;

function table(columns: string[], data: (string | number | null)[][] = []) {
  return { columns, data };
}

function boardSnapshot(board: string) {
  if (board !== "TQBR") {
    return {
      securities: table(["SECID", "SHORTNAME"]),
      marketdata: table(["SECID", "LAST", "LASTTOPREVPRICE", "MARKETPRICE"])
    };
  }
  return {
    securities: table(
      ["SECID", "SHORTNAME", "SECTYPE", "LOTSIZE"],
      SHARES.map(([ticker, name]) => [ticker, name, "1", 1])
    ),
    marketdata: table(
      ["SECID", "LAST", "LCURRENTPRICE", "LASTTOPREVPRICE", "MARKETPRICE"],
      SHARES.map(([ticker, , price]) => [ticker, price, price, 0.5, price])
    )
  };
}

/** Закрытия по будням от `from` до `till`: плавный рост к сегодняшней цене. */
function history(ticker: string, from: string, till: string, start: number) {
  const base = INDEXES[ticker] ?? SHARES.find(([secid]) => secid === ticker)?.[2] ?? 100;
  const days: string[] = [];
  for (
    let day = new Date(`${from}T00:00:00Z`);
    day <= new Date(`${till}T00:00:00Z`);
    day = new Date(day.getTime() + 86_400_000)
  ) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) days.push(day.toISOString().slice(0, 10));
  }
  const rows = days.map((date, i) => {
    const progress = days.length > 1 ? i / (days.length - 1) : 1;
    const close = base * (0.85 + 0.15 * progress) * (1 + 0.01 * Math.sin(i / 3));
    return [date, Math.round(close * 100) / 100];
  });
  return { history: table(["TRADEDATE", "CLOSE"], rows.slice(start, start + HISTORY_PAGE)) };
}

/** Ответ «биржи» на адрес, по которому пошло приложение. */
export function fakeMoexResponse(address: string): unknown {
  const url = new URL(address);
  const historyPath = /\/iss\/history\/.*\/securities\/([^/]+)\.json$/.exec(url.pathname);
  if (historyPath) {
    const today = new Date().toISOString().slice(0, 10);
    return history(
      decodeURIComponent(historyPath[1]),
      url.searchParams.get("from") ?? today,
      url.searchParams.get("till") ?? today,
      Number(url.searchParams.get("start") ?? 0)
    );
  }
  const boardPath = /\/boards\/([^/]+)\/securities\.json$/.exec(url.pathname);
  if (boardPath) return boardSnapshot(boardPath[1]);
  // Дивиденды, купоны и прочее — пусто: выплат проверки не ждут.
  return {};
}

/** Направить запросы страницы к Мосбирже на эту «биржу». */
export async function fakeExchange(page: Page) {
  await page.route("https://iss.moex.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(fakeMoexResponse(route.request().url()))
    })
  );
}
