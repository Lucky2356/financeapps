import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Настройки с 1.46.0: семь разделов, на экране один. Прежде это была лента в
// девять экранов телефона, и владелец сказал прямо: «чтоб человеку не нужно
// было миллион лет листать».

// Пример данных — чтобы поверх настроек не открывалось приветствие.
test.beforeEach(async ({ page }) => {
  await seedExampleData(page);
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("первый экран — список разделов, раздел открывается и закрывается", async ({ page }) => {
    await openSettled(page, "/settings");
    const nav = page.getByTestId("settings-nav");
    await expect(nav).toBeVisible();
    // Списка настроек на первом экране нет — только разделы.
    await expect(page.getByLabel("Валюта")).toBeHidden();

    await nav.getByRole("button", { name: /Основные/ }).click();
    await expect(page).toHaveURL(/section=general/);
    await expect(page.getByRole("heading", { name: "Основные" })).toBeVisible();
    await expect(nav).toBeHidden();

    // Раздел короткий: два экрана телефона, не десять. Предел с запасом на
    // строку-другую — каждая новая настройка не должна ронять проверку, а
    // лента на весь список, как было до разделов, — должна.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThan(1800);

    await page.getByRole("button", { name: "Все настройки" }).click();
    await expect(nav).toBeVisible();
  });
});

test("на компьютере разделы переключаются, не уходя со страницы", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSettled(page, "/settings");
  const nav = page.getByTestId("settings-nav");
  await expect(page.getByRole("heading", { name: "Основные" })).toBeVisible();

  await nav.getByRole("button", { name: /Финансы/ }).click();
  await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible();
  await expect(page.getByText("Цель финансовой подушки")).toBeVisible();
  // Оглавление остаётся рядом.
  await expect(nav).toBeVisible();
});

test("старая ссылка на раздел ведёт туда, куда он переехал", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // «Риск и подушка» был отдельным разделом — теперь это часть «Финансов».
  await openSettled(page, "/settings?section=risk");
  await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible();
});

test("у настройки есть вопросик, и он объясняет простыми словами", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSettled(page, "/settings?section=general");
  await page.getByRole("button", { name: "Пояснение" }).first().click();
  await expect(page.getByRole("tooltip")).toContainText("Сами числа не пересчитываются");
});

test("мёртвых настроек больше нет", async ({ page }) => {
  // «Режим демо-данных» и «Тип операции по умолчанию» сохранялись — и нигде
  // не читались. Переключатель, который ничего не делает, хуже никакого.
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSettled(page, "/settings?section=general");
  await expect(page.getByText("Режим демо-данных")).toHaveCount(0);
  await expect(page.getByText("Тип операции по умолчанию")).toHaveCount(0);
});
