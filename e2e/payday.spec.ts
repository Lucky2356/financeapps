import { expect, test, type Locator, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// «До зарплаты»: когда приходит зарплата — по истории, числа месяца (несколько
// и «последний день»), раз в неделю или каждый день. Выбор живёт на устройстве
// под прежним ключом, и старая запись — одно число — продолжает работать.

test.use({ viewport: { width: 360, height: 740 } });

/** Нажать на плашку, под которой спрятан флажок или радиокнопка, — как пальцем. */
async function tap(input: Locator) {
  await input.locator("xpath=..").click();
}

async function openPicker(page: Page) {
  const card = page.getByTestId("payday");
  await expect(card).toBeVisible({ timeout: 20_000 });
  const row = card.getByRole("button", { expanded: false });
  await row.click();
  const picker = card.getByTestId("payday-picker");
  await expect(picker).toBeVisible();
  return { card, picker };
}

test("несколько дней, неделя и каждый день — заголовок и сумма в ногу с выбором", async ({
  page
}) => {
  await seedExampleData(page);
  await openSettled(page, "/");
  const { card, picker } = await openPicker(page);
  const when = card.getByTestId("payday-when");

  // В примере зарплата 5-го — история её видит.
  await expect(picker.getByRole("radio", { name: "По истории", exact: true })).toBeChecked();
  await expect(picker.getByText(/По истории — 5-го числа/)).toBeVisible();

  // Аванс 10-го и зарплата 25-го.
  await tap(picker.getByRole("radio", { name: "Числа месяца", exact: true }));
  await expect(picker.getByRole("checkbox", { name: "5-го числа", exact: true })).toBeChecked();
  await tap(picker.getByRole("checkbox", { name: "5-го числа", exact: true }));
  await tap(picker.getByRole("checkbox", { name: "10-го числа", exact: true }));
  await tap(picker.getByRole("checkbox", { name: "25-го числа", exact: true }));
  await expect(when).toHaveText(/^(До зарплаты \d+ (день|дня|дней) \(|Зарплата завтра)/);
  expect(await page.evaluate(() => localStorage.getItem("payday-day"))).toBe("10,25");

  // «Последний день месяца» — с клавиатуры: Tab до флажка и пробел.
  const last = picker.getByRole("checkbox", { name: "Последний день месяца", exact: true });
  await last.focus();
  await page.keyboard.press("Space");
  await expect(last).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("payday-day"))).toBe("10,25,last");

  // Каждую пятницу: в заголовке дата с днём недели.
  await tap(picker.getByRole("radio", { name: "Раз в неделю", exact: true }));
  await tap(picker.getByRole("radio", { name: "каждую пятницу", exact: true }));
  await expect(when).toHaveText(/пт, \d+/);
  expect(await page.evaluate(() => localStorage.getItem("payday-day"))).toBe("week:5");

  // Каждый день: «до завтра», без «в день».
  await tap(picker.getByRole("radio", { name: "Каждый день", exact: true }));
  await expect(when).toHaveText("Зарплата каждый день");
  await expect(card.getByTestId(/payday-(free|short)/)).toHaveText(/^До завтра /);
  expect(await page.evaluate(() => localStorage.getItem("payday-day"))).toBe("daily");

  // Обратно к истории.
  await tap(picker.getByRole("radio", { name: "По истории", exact: true }));
  expect(await page.evaluate(() => localStorage.getItem("payday-day"))).toBe("");

  // Ничего не вылезает за экран телефона.
  const box = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("старая запись — одно число — открывается как «Числа месяца»", async ({ page }) => {
  await seedExampleData(page);
  await page.evaluate(() => localStorage.setItem("payday-day", "20"));
  await openSettled(page, "/");
  const { picker } = await openPicker(page);
  await expect(picker.getByRole("radio", { name: "Числа месяца", exact: true })).toBeChecked();
  await expect(picker.getByRole("checkbox", { name: "20-го числа", exact: true })).toBeChecked();
  await expect(picker.getByRole("checkbox", { name: "5-го числа", exact: true })).not.toBeChecked();
});
