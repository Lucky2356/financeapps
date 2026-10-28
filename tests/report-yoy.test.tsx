// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { YoYChange } from "@/components/reports/report-view";
import { I18nProvider } from "@/lib/i18n/context";
import { setDisplayLocale } from "@/lib/i18n/display-locale";
import { buildYoY } from "@/lib/reports/period-report";

// «Год к году» под первым годом учёта писал «+100.0% к пред. году»: прошлого
// года в книге нет, а выглядело ростом вдвое. Сравнивать не с чем — «—».
describe("год к году без прошлого года", () => {
  afterEach(() => {
    localStorage.removeItem("app-locale");
    // Язык чисел — общий на модуль; провайдер следующей проверки начинает с
    // русского и не переключает то, что уже по-русски.
    setDisplayLocale("ru");
  });

  it("процента нет, вместо него прочерк и пояснение", async () => {
    localStorage.setItem("app-locale", "en");
    const yoy = buildYoY([{ date: "2026-03-10", type: "INCOME", amount: 50000 }] as never, 2026);
    expect(yoy.incomeChangePct).toBeNull();

    render(
      <I18nProvider>
        <YoYChange pct={yoy.incomeChangePct} className="text-success" prev={2025} />
      </I18nProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("yoy-change").textContent).toBe("— no data for 2025")
    );
    expect(screen.getByTestId("yoy-change").textContent).not.toMatch(/%/);
  });

  it("с прошлым годом — процент с разделителем языка", async () => {
    localStorage.setItem("app-locale", "ru");
    render(
      <I18nProvider>
        <YoYChange pct={12.5} className="text-success" prev={2025} />
      </I18nProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("yoy-change").textContent).toBe("+12,5% к пред. году")
    );
  });
});
