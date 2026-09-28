// Вклады и накопительные счета: сколько принесут в месяц и к концу срока,
// и напоминание за неделю до конца — чтобы деньги не легли под «пролонгацию
// на новых условиях» (обычно — под меньший процент).

import { earnsInterest, interestSchedule, type InterestAccount } from "@/lib/accounts/interest";
import { roundMoney } from "@/lib/utils";

const DAY_MS = 86_400_000;
export const DEPOSIT_REMIND_DAYS = 7;

export type DepositOutlook = {
  /** Среднее за месяц на ближайший год (или до конца вклада). */
  monthly: number;
  /** null — накопительный счёт без срока. */
  endsOn: string | null;
  daysLeft: number | null;
  /** Проценты до конца вклада (для счёта без срока — за год). */
  untilEnd: number;
  /** Сколько будет на счёте к концу срока / через год. */
  atEnd: number;
};

const dayOf = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
const dayOfIso = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS;

export function depositOutlook(
  account: InterestAccount,
  today: Date = new Date()
): DepositOutlook | null {
  if (!earnsInterest(account)) return null;
  const endsOn = account.depositEndsOn ?? null;
  const daysLeft = endsOn ? Math.round(dayOfIso(endsOn) - dayOf(today)) : null;
  if (daysLeft !== null && daysLeft < 0) return null;
  const horizon = daysLeft ?? 365;
  const schedule = interestSchedule(account, today, horizon);
  let untilEnd = schedule.reduce((sum, accrual) => sum + accrual.amount, 0);
  // Хвост после последней капитализации до конца вклада — простые проценты.
  if (endsOn && daysLeft !== null) {
    const lastDay = schedule.length ? dayOfIso(schedule[schedule.length - 1].date) : dayOf(today);
    const tail = dayOfIso(endsOn) - lastDay;
    if (tail > 0) {
      untilEnd += ((account.balance + untilEnd) * (account.interestRate ?? 0) * tail) / 100 / 365;
    }
  }
  const months = Math.max(horizon / 30.4375, 1);
  return {
    monthly: roundMoney(untilEnd / months),
    endsOn,
    daysLeft,
    untilEnd: roundMoney(untilEnd),
    atEnd: roundMoney(account.balance + untilEnd)
  };
}

/** Вклады, которые кончаются в ближайшую неделю (включая сегодня). */
export function depositsEndingSoon<T extends InterestAccount>(
  accounts: readonly T[],
  today: Date = new Date()
): Array<{ account: T; daysLeft: number }> {
  return accounts
    .filter((account) => account.depositEndsOn && account.balance > 0)
    .map((account) => ({
      account,
      daysLeft: Math.round(dayOfIso(account.depositEndsOn as string) - dayOf(today))
    }))
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft <= DEPOSIT_REMIND_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
