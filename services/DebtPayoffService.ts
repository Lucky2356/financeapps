import { roundMoney } from "@/lib/utils";

export type PayoffStrategy = "avalanche" | "snowball";

export type PayoffInput = {
  balance: number;
  /** Annual interest rate in percent (0 for interest-free). */
  interestRate: number;
  /** Fixed monthly payment applied to this debt. */
  minPayment: number;
};

// Pure debt-payoff math shared by web and desktop. Standard fixed-payment
// amortization; payoff ordering for the two common consumer strategies.
export class DebtPayoffService {
  // Months to clear the balance at a fixed monthly payment. Returns null when
  // the debt never amortizes (payment ≤ monthly interest) or payment ≤ 0.
  monthsToPayoff(balance: number, annualRatePct: number, monthlyPayment: number): number | null {
    if (balance <= 0) return 0;
    if (monthlyPayment <= 0) return null;

    const monthlyRate = annualRatePct / 100 / 12;
    if (monthlyRate <= 0) return Math.ceil(balance / monthlyPayment);

    const monthlyInterest = balance * monthlyRate;
    if (monthlyPayment <= monthlyInterest) return null; // payment never outpaces interest

    const months =
      -Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate);
    return Math.ceil(months);
  }

  // Total interest paid over the life of the debt at a fixed monthly payment.
  totalInterest(balance: number, annualRatePct: number, monthlyPayment: number): number | null {
    const months = this.monthsToPayoff(balance, annualRatePct, monthlyPayment);
    if (months === null) return null;
    if (months === 0) return 0;
    return Math.max(roundMoney(months * monthlyPayment - balance), 0);
  }

  // Payoff order: "avalanche" tackles the highest interest rate first (cheapest
  // overall); "snowball" tackles the smallest balance first (fastest wins).
  order<T extends PayoffInput>(debts: T[], strategy: PayoffStrategy): T[] {
    const copy = [...debts];
    copy.sort((left, right) =>
      strategy === "avalanche"
        ? right.interestRate - left.interestRate
        : left.balance - right.balance
    );
    return copy;
  }
}
