// Три даты, которые нужны почти всегда: сегодня, вчера, позавчера. Записать
// вчерашнюю трату через календарь телефона — пять касаний; здесь — одно.

export type QuickDate = { id: "today" | "yesterday" | "dayBefore"; iso: string };

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

export function quickDates(today: Date = new Date()): QuickDate[] {
  const back = (days: number) =>
    iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
  return [
    { id: "today", iso: back(0) },
    { id: "yesterday", iso: back(1) },
    { id: "dayBefore", iso: back(2) }
  ];
}
