import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function percent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) {
    return 0;
  }

  return (value / total) * 100;
}

/**
 * The largest amount a personal ledger will ever hold, in the base currency.
 *
 * Not a policy about wealth — a guard against the keyboard. A zero that stuck
 * used to sail through: 99 999 999 999 999 999 was accepted and came back out
 * as -99 999 999 999 999 020, because past 2^53 hundredths a double no longer
 * holds every integer. The result is not the number anyone typed, and nothing
 * on screen says so. A trillion is far above any real balance and far below
 * where the arithmetic starts lying.
 */
export const MAX_MONEY = 1e12;

/** The message every amount check gives, so the wording cannot drift apart. */
export const MONEY_RANGE_ERROR = `Сумма должна быть больше нуля и меньше ${
  MAX_MONEY / 1e9
} млрд — иначе это опечатка, а не деньги.`;

/** True when a number is a usable amount of money. */
export function isUsableMoney(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_MONEY;
}

/**
 * To the kopeck, with halves going away from zero — the rule a person applies
 * on paper.
 *
 * The `+ Number.EPSILON` this replaces was asymmetric, and wrong in both
 * directions. It nudged upward, so it rescued 1.005 → 1.01 but not 8.165, whose
 * double sits further below the halfway mark than one epsilon covers; and the
 * same nudge pulled negatives toward zero, so −1.005 came out as −1 while
 * +1.005 came out as 1.01. Money that differs by sign should not round by
 * different rules.
 *
 * Taking the sign off first makes the two sides symmetric, and re-reading the
 * scaled number at 15 significant digits drops the representation noise that
 * put 816.4999999999999 where 816.5 belongs — while keeping every digit a
 * personal ledger can hold.
 */
export function roundMoney(value: number) {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Number((Math.abs(value) * 100).toPrecision(15)))) / 100;
}

export function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(",", "."));
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    return value.toNumber();
  }
  return Number(value ?? 0);
}
