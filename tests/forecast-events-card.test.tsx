// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ForecastEventsCard } from "@/components/forecast/forecast-events-card";
import type { ForecastEvent } from "@/types/finance";

// The filters are now themed (Radix) dropdowns, not native <select>s, so we open
// the trigger by its aria-label and click the option (pointer checks disabled for
// jsdom).
async function pickOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerLabel: string,
  optionName: string
) {
  await user.click(screen.getByLabelText(triggerLabel));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

// Titles are intentionally distinct from category names so text queries don't
// match the filter dropdown <option>s.
const events: ForecastEvent[] = [
  {
    id: "1",
    date: "2026-07-01",
    title: "Аванс",
    amount: 200000,
    type: "INCOME",
    category: "Зарплата",
    account: "Карта"
  },
  {
    id: "2",
    date: "2026-07-10",
    title: "Закупка",
    amount: 8000,
    type: "EXPENSE",
    category: "Еда",
    account: "Наличные"
  }
];

describe("ForecastEventsCard", () => {
  it("lists all planned events by default", () => {
    render(<ForecastEventsCard events={events} currency="RUB" />);
    expect(screen.getByText("Аванс")).toBeInTheDocument();
    expect(screen.getByText("Закупка")).toBeInTheDocument();
  });

  it("filters events by account", async () => {
    const user = userEvent.setup();
    render(<ForecastEventsCard events={events} currency="RUB" />);

    await pickOption(user, "Фильтр по счёту", "Наличные");

    expect(screen.queryByText("Аванс")).not.toBeInTheDocument();
    expect(screen.getByText("Закупка")).toBeInTheDocument();
  });

  it("shows an empty hint when filters exclude everything", async () => {
    const user = userEvent.setup();
    render(<ForecastEventsCard events={events} currency="RUB" />);

    await pickOption(user, "Фильтр по счёту", "Карта");
    await pickOption(user, "Фильтр по категории", "Еда");

    expect(screen.getByText("Нет событий по выбранным фильтрам.")).toBeInTheDocument();
  });
});
