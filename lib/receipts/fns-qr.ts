// QR-код с кассового чека.
//
// На каждом кассовом чеке в России — QR по формату ФНС:
//
//   t=20260927T1530&s=1234.50&fn=7380440700…&i=12345&fp=1234567890&n=1
//
// t — дата и время (ГГГГММДДTЧЧММ, иногда с секундами), s — сумма в рублях с
// копейками через точку, n — признак расчёта. Этого хватает, чтобы записать
// операцию, не набирая ни суммы, ни даты: навёл камеру — и готово. Всё здесь,
// на устройстве: к ФНС за составом чека не ходим — там нужен вход через
// «Госуслуги», и это уже совсем не «одно нажатие».

export type Receipt = {
  /** Сумма чека, ₽. */
  amount: number;
  /** Дата покупки, YYYY-MM-DD. */
  date: string;
  /** Время покупки, HH:MM. */
  time: string;
  /**
   * Приход (1) и возврат расхода (4) — деньги ушли от покупателя: расход.
   * Возврат прихода (2) и расход (3) — деньги вернулись к нему: доход.
   */
  type: "EXPENSE" | "INCOME";
};

const WHEN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/;

/** Разобрать текст QR. Не чек (или испорченный) — null, без исключений. */
export function parseFnsReceipt(text: string): Receipt | null {
  const raw = text.trim();
  // Чек — это набор «ключ=значение» через &, без схемы. Ссылка на связку
  // устройств или сайт — не чек, даже если в ней найдётся «s=».
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;

  const fields = new Map<string, string>();
  for (const part of raw.split("&")) {
    const at = part.indexOf("=");
    if (at <= 0) continue;
    fields.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim());
  }
  // Номер фискального накопителя — то, что отличает чек от случайной строки
  // «t=…&s=…».
  if (!fields.get("fn")) return null;

  const when = WHEN.exec(fields.get("t") ?? "");
  if (!when) return null;
  const [, year, month, day, hour, minute] = when;
  const probe = new Date(Number(year), Number(month) - 1, Number(day));
  if (probe.getMonth() !== Number(month) - 1 || probe.getDate() !== Number(day)) return null;
  if (Number(hour) > 23 || Number(minute) > 59) return null;

  const sum = (fields.get("s") ?? "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(sum)) return null;
  const amount = Number(sum);
  if (!(amount > 0)) return null;

  const kind = fields.get("n") ?? "1";
  return {
    amount,
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    type: kind === "2" || kind === "3" ? "INCOME" : "EXPENSE"
  };
}
