// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MetricCard } from "@/components/metric-card";
import { I18nProvider } from "@/lib/i18n/context";
import { setDisplayLocale } from "@/lib/i18n/display-locale";
import type { MetricCard as Metric } from "@/types/finance";

// Заготовка статической сборки (lib/data.ts) — по-русски и с нулями. На первом
// кадре английского экрана плитка показывала «Общий баланс» и «0 ₽».
const SNAPSHOT: Metric = {
  key: "totalBalance",
  title: "Общий баланс",
  value: "0 ₽",
  detail: "Все активные счета"
};

describe("плитка метрики", () => {
  afterEach(() => {
    localStorage.removeItem("app-locale");
    setDisplayLocale("ru");
  });

  it("подпись — из словаря по ключу метрики, а не готовой строкой", async () => {
    localStorage.setItem("app-locale", "en");
    render(
      <I18nProvider>
        <MetricCard metric={SNAPSHOT} />
      </I18nProvider>
    );
    await waitFor(() => expect(screen.getByText("Total balance")).toBeInTheDocument());
    expect(screen.getByText("All active accounts")).toBeInTheDocument();
    expect(screen.queryByText("Общий баланс")).toBeNull();
  });

  it("метрика без знакомого ключа показывает то, что пришло", () => {
    render(<MetricCard metric={{ title: "Своя метрика", value: "5", detail: "пояснение" }} />);
    expect(screen.getByText("Своя метрика")).toBeInTheDocument();
    expect(screen.getByText("пояснение")).toBeInTheDocument();
  });

  it("пока чисел нет — заглушка вместо «0 ₽»", () => {
    render(<MetricCard metric={SNAPSHOT} loading />);
    expect(screen.getByTestId("metric-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("0 ₽")).toBeNull();
  });
});
