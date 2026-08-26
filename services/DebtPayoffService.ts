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
  //
  // Walked month by month rather than "payments × months − debt": the last
  // payment is almost always a partial one, and counting it as a full payment
  // turned its remainder into interest. An interest-free debt of 100 000 ₽ paid
  // 30 000 ₽ a month reported an overpayment of 20 000 ₽ — the change from the
  // fourth payment — and a 12% one reported that same 20 000 ₽ instead of 2 248 ₽.
  totalInterest(balance: number, annualRatePct: number, monthlyPayment: number): number | null {
    const months = this.monthsToPayoff(balance, annualRatePct, monthlyPayment);
    if (months === null) return null;
    if (months === 0) return 0;

    const monthlyRate = annualRatePct / 100 / 12;
    if (monthlyRate <= 0) return 0;

    let outstanding = balance;
    let interest = 0;
    for (let month = 0; month < months && outstanding > 0; month += 1) {
      const accrued = outstanding * monthlyRate;
      interest += accrued;
      outstanding = outstanding + accrued - monthlyPayment;
    }
    return Math.max(roundMoney(interest), 0);
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
