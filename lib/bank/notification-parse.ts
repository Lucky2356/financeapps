// Разбор уведомлений банка: «Покупка 450 ₽, Пятёрочка» → сумма, место, вид.
//
// Уведомления собирает Android (BankNotifications.kt) — пуши банковских
// приложений и SMS. Форматы у банков разные и меняются, поэтому разбор не
// привязан к банку: ищем вид движения по словам, сумму — первую денежную, не
// считая остатка («Баланс», «Доступно»), место — то, что осталось, когда
// убраны служебные куски (карта, время, остаток).
//
// Чего не понимаем — не предлагаем: лучше промолчать, чем подсунуть трату,
// которой не было. Отказы и коды подтверждения отбрасываются сразу.

export type BankNotification = {
  package: string;
  app: string;
  title: string;
  text: string;
  /** Когда пришло, мс с 1970. */
  at: number;
};

export type BankSuggestion = {
  /** Устойчивый ключ: одно и то же уведомление — одно предложение. */
  id: string;
  type: "EXPENSE" | "INCOME";
  amount: number;
  /** Где — как написал банк; пусто, если не разобрать. */
  merchant: string;
  /** Последние цифры карты или счёта, если есть. */
  card: string | null;
  /** День по часам телефона, YYYY-MM-DD. */
  date: string;
  at: number;
  app: string;
  /** Исходный текст — показать, откуда взялось. */
  source: string;
};

const MONEY = String.raw`(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:₽|руб(?:\.|лей|ля|ль)?|р\.?(?![а-яё])|rub|rur)`;

const EXPENSE =
  /покупк|оплат|списан|спис\.|снятие|выдача налич|перевод(?! от)|payment|purchase|debit/i;
const INCOME =
  /зачислен|пополнен|поступлен|перевод от|вам перевели|возврат|кэшбэк|cashback|refund/i;
// Входящий перевод, где «от кого» стоит после суммы — так пишет Сбер:
// «СЧЁТ1234 10:00 Перевод 500р от Ивана И. Баланс: 12 300р».
const TRANSFER_IN = /перевод[^.;]*?\sот\s/i;
// Слова, при которых это точно трата, даже если где-то рядом «от».
const SPENT = /покупк|оплат|списан|спис\.|снятие|выдача налич|payment|purchase|debit/i;
// Не трата и не доход: отказ, код, недостаточно средств, «ожидается».
const SKIP =
  /отказ|отклон|недостаточно|не прошл|код|пароль|code|password|declined|ожидает|запланир|предодобр|кредитн(?:ый|ого) лимит/i;
// Куски, которые не место: остаток, карта, время, дата.
const BALANCE = new RegExp(
  String.raw`(?:баланс|доступно|остаток|ост\.?|бал\.?|balance)\s*:?\s*` + MONEY,
  "gi"
);
const CARD =
  /(?:карт[аыеу]?|счёт|счет|сч\.?|card|mir|visa|ecmc|mc|maestro)\s*[*•·.\-]*\s*(\d{4})|[*•·]{1,2}\s?(\d{4})|\b(?:ECMC|MIR|VISA|MC|СЧЁТ|СЧЕТ)(\d{4})\b/i;

function toNumber(whole: string, fraction?: string): number {
  const value = Number(`${whole.replace(/[   ]/g, "")}.${fraction ?? "0"}`);
  return Math.round(value * 100) / 100;
}

function dayOf(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hash(text: string): string {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) {
    value = ((value << 5) + value + text.charCodeAt(index)) | 0;
  }
  return (value >>> 0).toString(36);
}

/** Место: что осталось от текста без суммы, карты, остатка, времени и слов банка. */
function merchantOf(text: string, amountMatch: string): string {
  let rest = text.replace(BALANCE, " ");
  rest = rest.replace(amountMatch, " | ");
  rest = rest
    .replace(new RegExp(CARD.source, "gi"), " ")
    .replace(/\b\d{1,2}[.:]\d{2}(?:[.:]\d{2,4})?\b/g, " ")
    .replace(
      /покупка|оплата|списание|спис\.|снятие|выдача наличных|зачислени[ея]|зачислен[аоы]?|пополнение|поступление|перевод от|возврат|успешно|по карте|на карту|картой|в магазине|магазин|на сумму|сумма|payment|purchase|кэшбэк/gi,
      " "
    );
  // Место — ближайший осмысленный кусок после суммы, иначе до неё.
  const [before, after = ""] = rest.split("|");
  const clean = (part: string) =>
    part
      .split(/[.;\n]|,\s/)
      .map((piece) =>
        piece
          .replace(/\s+/g, " ")
          .replace(/^[\s,:\-–—«"]+|[\s,:\-–—»"]+$/g, "")
          // «от Ивана И.» — место (вернее, человек) без предлога.
          .replace(/^от\s+/i, "")
      )
      .filter(
        (piece) => /[a-zа-яё]{2,}/i.test(piece) && !/^(?:в|на|от|с|по|за|rub|rur|руб)$/i.test(piece)
      );
  const candidate = clean(after)[0] ?? clean(before).pop() ?? "";
  return candidate.slice(0, 60);
}

export function parseBankNotification(item: BankNotification): BankSuggestion | null {
  const source = [item.title, item.text].filter(Boolean).join(". ").replace(/\s+/g, " ").trim();
  if (!source || SKIP.test(source)) return null;
  const transferIn = TRANSFER_IN.test(source);
  // «Перевод 500р от Ивана» — деньги пришли, хотя слово «перевод» есть и у трат.
  const expense = EXPENSE.test(source) && !(transferIn && !SPENT.test(source));
  const income = INCOME.test(source) || transferIn;
  if (!expense && !income) return null;
  // «Возврат покупки» — это деньги назад, а не трата.
  const type: BankSuggestion["type"] =
    income && (!expense || /возврат|refund/i.test(source)) ? "INCOME" : "EXPENSE";

  const withoutBalance = source.replace(BALANCE, " ");
  const money = new RegExp(MONEY, "i").exec(withoutBalance);
  if (!money) return null;
  const amount = toNumber(money[1], money[2]);
  if (!(amount > 0) || amount > 100_000_000) return null;

  const card = CARD.exec(source);
  return {
    id: hash(`${item.package}|${item.at}|${source}`),
    type,
    amount,
    merchant: merchantOf(source, money[0]),
    card: card ? (card[1] ?? card[2] ?? card[3] ?? null) : null,
    date: dayOf(item.at),
    at: item.at,
    app: item.app,
    source: source.slice(0, 300)
  };
}
