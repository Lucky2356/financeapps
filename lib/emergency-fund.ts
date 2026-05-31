// Builds the emergency-fund status (reserve vs. target) shared by the web and
// desktop dashboard builders, so the metric is computed identically in both.

import type { EmergencyFundStatus } from "@/types/finance";
import { clamp } from "@/lib/utils";

export function buildEmergencyFund(params: {
  savingsBalance: number;
  averageMonthlyExpense: number;
  targetMonths: number;
}): EmergencyFundStatus {
  const { savingsBalance, averageMonthlyExpense, targetMonths } = params;
  const months = averageMonthlyExpense > 0 ? savingsBalance / averageMonthlyExpense : 0;
  const targetAmount = Math.round(targetMonths * averageMonthlyExpense);
  const progress =
    targetAmount > 0 ? clamp(Math.round((savingsBalance / targetAmount) * 100), 0, 100) : savingsBalance > 0 ? 100 : 0;

  return {
    amount: Math.round(savingsBalance),
    months: Math.round(months * 10) / 10,
    targetMonths,
    targetAmount,
    progress
  };
}
