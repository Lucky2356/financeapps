import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// «Учёт» на телефоне: карточки операций короче, дата дня заметна и прилипает,
// фильтры наверху и с ровным правым краем.

test.describe("карточки и дни", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("карточка без пустого ряда, кнопки по 40 px, дата — в заголовке дня", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/transactions?period=all");

    const header = page.getByTestId("day-header").first();
    const card = page.getByTestId("day-group").first().getByTestId("tx-card").first();
    await expect(card).toBeVisible();

    // Корзина стояла одна в своём ряду под скрепкой — карточка выходила
    // высотой около 130 px. Теперь обе кнопки в одном ряду.
    const cardBox = (await card.boundingBox())!;
    expect(cardBox.height).toBeLessThanOrEqual(90);
    for (const name of [/Фото чека|Есть фото чека/, /^Удалить$/]) {
      const box = (await card.getByRole("button", { name }).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(40);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    // Дата дня — в заголовке; в карточке под ним её не повторяем.
    const day = (await header.textContent()) ?? "";
    const date = day.match(/\d{2} [а-я]+\.? \d{4}/)?.[0];
    expect(date).toBeTruthy();
    await expect(card).not.toContainText(date!);

    // Заголовок дня — цветом текста и полужирный, не серой подписью.
    const style = await header.evaluate((el) => {
      const s = getComputedStyle(el);
      const muted = document.createElement("span");
      muted.className = "text-muted-foreground";
      document.body.appendChild(muted);
      const mutedColor = getComputedStyle(muted).color;
      muted.remove();
      return { color: s.color, weight: Number(s.fontWeight), mutedColor };
    });
    expect(style.weight).toBeGreaterThanOrEqual(600);
    expect(style.color).not.toBe(style.mutedColor);
  });

  test("заголовок дня прилипает под шапкой, пока листаешь этот день", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/transactions?period=all");

    const header = page.getByTestId("day-header").first();
    const section = page.getByTestId("day-group").first();
    const topBar = await page.locator("header").first().boundingBox();
    const start = (await header.boundingBox())!;
    // Прокрутить так, чтобы день ушёл под шапку наполовину.
    // Мгновенно: у html стоит плавная прокрутка, и замер попал бы в её середину.
    await page.evaluate(
      (y) => window.scrollTo({ top: window.scrollY + y, behavior: "instant" }),
      start.y - topBar!.height + 40
    );
    await page.waitForTimeout(300);
    const stuck = (await header.boundingBox())!;
    const sectionBox = (await section.boundingBox())!;
    expect(sectionBox.y).toBeLessThan(stuck.y);
    expect(Math.abs(stuck.y - topBar!.height)).toBeLessThanOrEqual(2);
  });
});

async function rightEdges(page: Page) {
  return page.getByTestId("tx-filters").evaluate((card) => {
    const pick = (selector: string) =>
      Array.from(card.querySelectorAll(selector)).map((el) =>
        Math.round(el.getBoundingClientRect().right)
      );
    return {
      category: pick('button[aria-label="Категория"]'),
      dates: pick('input[type="date"]'),
      selects: pick("button[role=combobox]"),
      search: pick("#tx-search")
    };
  });
}

// Окно приложения на компьютере: 1280 минус полоса прокрутки WebView2.
for (const width of [360, 390, 430, 1265]) {
  test(`${width}px: фильтры наверху, правый край у всех рядов один`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await seedExampleData(page);
    await openSettled(page, "/transactions");

    // Первая карточка экрана — фильтры, выше аналитики и переключателя видов.
    const filters = page.getByTestId("tx-filters");
    const analytics = page.getByText("Аналитика по операциям");
    expect((await filters.boundingBox())!.y).toBeLessThan((await analytics.boundingBox())!.y);

    const edges = await rightEdges(page);
    const right = edges.search[0];
    // Первый ряд: «Операции», кнопка фильтров, категории — категории до края.
    expect(edges.category).toEqual([right]);
    expect(edges.selects[1]).toBe(right);
    // На телефоне даты — свой ряд во всю ширину. На широком экране даты,
    // счёт и тип встают в один ряд, и до края доходит только последний — тип.
    if (width < 1024) expect(edges.dates[1]).toBe(right);

    // Кнопка фильтров — между заголовком и категориями, в одном ряду с ними.
    const title = (await filters.getByText("Операции", { exact: true }).first().boundingBox())!;
    const gear = (await filters.getByRole("button", { name: "Фильтры" }).boundingBox())!;
    const category = (await filters.getByRole("button", { name: "Категория" }).boundingBox())!;
    expect(gear.x).toBeGreaterThanOrEqual(title.x + title.width);
    expect(gear.x + gear.width).toBeLessThanOrEqual(category.x);
    expect(
      Math.abs(gear.y + gear.height / 2 - (category.y + category.height / 2))
    ).toBeLessThanOrEqual(2);

    // Даты и пара «счёт — тип» — равными колонками.
    const box = async (selector: string, index: number) =>
      (await filters.locator(selector).nth(index).boundingBox())!;
    const from = await box('input[type="date"]', 0);
    const to = await box('input[type="date"]', 1);
    expect(Math.abs(from.width - to.width)).toBeLessThanOrEqual(1);
    const account = await box("button[role=combobox]", 0);
    const type = await box("button[role=combobox]", 1);
    expect(Math.abs(account.width - type.width)).toBeLessThanOrEqual(1);

    // Панель фильтров открывается поверх всего: кнопка теперь в начале ряда,
    // и панель, раскрытая влево, на ПК уходила под боковое меню — то
    // перехватывало нажатия. Каждый угол панели и её середина — её же.
    await filters.getByRole("button", { name: "Фильтры" }).click();
    const panel = page.getByTestId("more-filters-panel");
    await expect(panel).toBeVisible();
    const covered = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const points = [
        [r.left + 4, r.top + 4],
        [r.right - 4, r.top + 4],
        [r.left + r.width / 2, r.top + Math.min(r.height / 2, 60)]
      ];
      return points.filter(([x, y]) => !el.contains(document.elementFromPoint(x, y))).length;
    });
    expect(covered).toBe(0);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // Те же фильтры на месте и в календаре.
    await page.getByRole("radiogroup", { name: "Вид" }).getByText("Календарь").click();
    await expect(page.getByTestId("transactions-calendar")).toBeVisible();
    await expect(filters).toBeVisible();
    expect(await rightEdges(page)).toEqual(edges);
  });
}
