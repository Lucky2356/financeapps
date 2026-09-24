// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";

import { HoldingCard } from "@/components/investments/holding-card";
import { I18nProvider } from "@/lib/i18n/context";
import type { InvestmentData } from "@/types/finance";

beforeEach(() => {
  localStorage.setItem("app-locale", "ru");
});

// Просьба владельца: у каждой бумаги видеть среднюю цену покупки. Она была —
// но только в развёрнутой карточке, то есть по одной бумаге за нажатие.
it("средняя цена покупки видна, не раскрывая карточку", () => {
  const position = {
    ticker: "SBER",
    name: "Сбербанк",
    assetKind: "STOCK",
    quantity: 40,
    averageBuyPrice: 175,
    currentPrice: 300,
    currentValue: 12000,
    pnl: 5000,
    share: 100,
    sector: "Финансы"
  } as unknown as InvestmentData["portfolio"][number];

  render(
    <I18nProvider>
      <HoldingCard
        position={position}
        currency="RUB"
        expanded={false}
        onToggle={() => undefined}
        onEdit={() => undefined}
        onRemove={() => undefined}
      />
    </I18nProvider>
  );

  const line = screen.getByTestId("holding-average");
  expect(line.textContent).toMatch(/40 шт\./);
  expect(line.textContent).toMatch(/средняя цена покупки 175/);
});
