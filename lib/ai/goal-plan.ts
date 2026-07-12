import { answerLanguageInstruction, type AiLocale } from "@/lib/ai/lang";

// AI savings plan for a single goal: given the goal (target, saved, deadline) and
// the user's current free cashflow, propose a realistic contribution plan and
// where to find the money. Free-text (advisory) reply. Network-free.

export type GoalPlanInput = {
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string; // ISO date or ""
  monthlyFreeCashflow: number;
  currency: string;
};

export function buildGoalPlanPrompt(
  goal: GoalPlanInput,
  locale: AiLocale
): { system: string; user: string } {
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const system = [
    "You are a savings-planning assistant. Propose a realistic monthly contribution plan for the goal.",
    "Use the free cashflow as the ceiling; if the deadline is too tight, say so and suggest a feasible date or a higher contribution.",
    "Give: recommended monthly contribution, expected completion timeframe, and 2–3 concrete ways to free up money.",
    "Be concise and specific. No guarantees — this is guidance.",
    answerLanguageInstruction(locale)
  ].join(" ");

  const user = [
    `Goal: ${goal.title}.`,
    `Target: ${Math.round(goal.targetAmount)} ${goal.currency}; already saved: ${Math.round(
      goal.currentAmount
    )} ${goal.currency}; remaining: ${Math.round(remaining)} ${goal.currency}.`,
    `Deadline: ${goal.deadline || "not set"}.`,
    `Current free cashflow: ${Math.round(goal.monthlyFreeCashflow)} ${goal.currency}/month.`
  ].join("\n");

  return { system, user };
}
