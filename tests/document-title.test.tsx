// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentTitle, documentTitleFor } from "@/components/document-title";
import { translate } from "@/lib/i18n/catalog";
import { I18nProvider } from "@/lib/i18n/context";
import { setDisplayLocale } from "@/lib/i18n/display-locale";

const { path } = vi.hoisted(() => ({ path: { current: "/analytics" } }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

const tEn = (key: string) => translate("en", key);
const tRu = (key: string) => translate("ru", key);

// Метаданные страниц статические и по-русски; заголовок окна на английском
// экране обязан быть английским, а <html lang> — следовать языку (от него
// зависят переносы по слогам).
describe("заголовок окна на языке экрана", () => {
  afterEach(() => {
    localStorage.removeItem("app-locale");
    setDisplayLocale("ru");
    path.current = "/analytics";
  });

  it("строится из названия экрана и приложения", () => {
    expect(documentTitleFor("/analytics", tEn)).toBe("Analytics | Financial Assistant");
    expect(documentTitleFor("/what-if", tEn)).toBe("What if | Financial Assistant");
    expect(documentTitleFor("/analytics", tRu)).toBe("Аналитика | Финансовый помощник");
    // Главная и экран без своего названия — только название приложения.
    expect(documentTitleFor("/", tEn)).toBe("Financial Assistant");
    expect(documentTitleFor("/import", tEn)).toBe("Financial Assistant");
  });

  it("английский экран — английский заголовок и lang=en, даже поверх метаданных", async () => {
    localStorage.setItem("app-locale", "en");
    render(
      <I18nProvider>
        <DocumentTitle />
      </I18nProvider>
    );
    await waitFor(() => expect(document.title).toBe("Analytics | Financial Assistant"));
    expect(document.documentElement.lang).toBe("en");

    // Next при переходе ставит <title> из статических (русских) метаданных.
    document.title = "Аналитика | Финансовый помощник";
    await waitFor(() => expect(document.title).toBe("Analytics | Financial Assistant"));
  });

  it("русский экран — русский заголовок и lang=ru", async () => {
    localStorage.setItem("app-locale", "ru");
    path.current = "/what-if";
    render(
      <I18nProvider>
        <DocumentTitle />
      </I18nProvider>
    );
    await waitFor(() => expect(document.title).toBe("Что если | Финансовый помощник"));
    expect(document.documentElement.lang).toBe("ru");
  });
});
