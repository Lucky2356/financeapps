import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// GUARD: человек должен узнать, что его финансовая история не защищена ничем.
//
// Приложение — единственное место, где эта история живёт: сервера нет,
// автобэкап по умолчанию выключен. До 1.25.0 единственным, что об этом
// говорило, был пункт в «Быстром старте» — блоке, который закрывается крестиком
// НАВСЕГДА (флаг в localStorage). Один клик, и предупреждение не возвращалось
// уже никогда: можно было полгода вести учёт без единой копии и узнать об этом,
// только когда данных не стало.
//
// Отсюда главная проверка ниже: строка обязана быть видна при закрытом
// «Быстром старте». Это ровно то, чего раньше не было.
const CHECKLIST_DISMISSED = "setup-checklist-dismissed-v1";

test("предупреждение о копии переживает закрытый «Быстрый старт»", async ({ page }) => {
  await seedExampleData(page);

  await page.evaluate((key) => localStorage.setItem(key, "true"), CHECKLIST_DISMISSED);
  await openSettled(page, "/");

  await expect(page.getByTestId("backup-notice")).toBeVisible();
  // Молчать о том, что копии нет вовсе, и о том, что она позапрошлогодняя, —
  // разные вещи; на чистом примере копии не было ни разу.
  await expect(page.getByTestId("backup-notice")).toContainText(/копии нет/i);
  // Не /import: тот адрес — клиентский редирект для старых закладок, и
  // отправлять человека через него незачем.
  await expect(page.getByTestId("backup-notice-link")).toHaveAttribute(
    "href",
    "/settings?section=data"
  );
});

test("на пустой установке молчит — терять нечего", async ({ page }) => {
  await openSettled(page, "/");

  await expect(page.getByTestId("backup-notice")).toHaveCount(0);
});
