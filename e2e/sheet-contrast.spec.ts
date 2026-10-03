import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// GUARD: «Таблица» читается в обеих темах. Владелец 2.4.0: «тёмный цвет букв на
// тёмном фоне». Фиолетовые названия столбцов и месяцев давали на тёмных
// ячейках 3,8–4,2:1 при норме 4,5:1 (WCAG AA для обычного текста). Здесь каждый
// кусок текста на экране таблицы сверяется со своим настоящим фоном — с учётом
// полупрозрачных подложек, которыми таблица красит группы столбцов.

for (const scheme of ["dark", "light"] as const) {
  test(`таблица: текст контрастен фону (${scheme === "dark" ? "тёмная" : "светлая"} тема)`, async ({
    page
  }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 860 });
    await seedExampleData(page);
    await openSettled(page, "/sheet");
    await page.getByRole("button", { name: "Создать таблицу" }).click();
    const wizard = page.getByTestId("sheet-wizard");
    await expect(wizard.getByTestId("wizard-articles")).toHaveAttribute("data-loaded", "true");
    await wizard.getByRole("button", { name: "Выбрать все" }).click();
    await wizard.getByLabel("Сколько денег сейчас").fill("50000");
    await wizard.getByLabel("Доход в месяц").fill("150000");
    await wizard.getByRole("button", { name: "Создать таблицу" }).click();
    await expect(wizard).toBeHidden();
    await expect(page.getByTestId("sheet-grid")).toBeVisible();
    // Выбранная клетка — самое тёмное сочетание: подложка выделения под цифрами.
    await page.locator("td[data-col]").nth(8).click();

    const low = await page.evaluate(() => {
      type Rgba = { r: number; g: number; b: number; a: number };
      const parse = (color: string): Rgba => {
        const [r, g, b, a] = (color.match(/[\d.]+/g) ?? ["0", "0", "0", "0"]).map(Number);
        return { r, g, b, a: a ?? 1 };
      };
      const over = (top: Rgba, under: Rgba): Rgba => ({
        r: top.r * top.a + under.r * (1 - top.a),
        g: top.g * top.a + under.g * (1 - top.a),
        b: top.b * top.a + under.b * (1 - top.a),
        a: 1
      });
      const luminance = (c: Rgba) => {
        const f = (v: number) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const background = (el: Element): Rgba => {
        const layers: Rgba[] = [];
        for (let node: Element | null = el; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          // Оттенки групп таблицы — градиент поверх bg-card: это тоже фон.
          const tint = style.backgroundImage.match(/rgba?\([^)]+\)/);
          if (tint) layers.push(parse(tint[0]));
          const color = parse(style.backgroundColor);
          if (color.a > 0) layers.push(color);
          if (color.a >= 1) break;
        }
        let result = parse(getComputedStyle(document.body).backgroundColor);
        for (const layer of layers.reverse()) result = over(layer, result);
        return result;
      };
      const found: string[] = [];
      const root = document.querySelector("main") ?? document.body;
      for (const el of Array.from(root.querySelectorAll("*"))) {
        const ownText = Array.from(el.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim()
        );
        if (!ownText) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (el.closest("[aria-hidden=true],[data-sonner-toaster]")) continue;
        const bg = background(el);
        const fg = over(parse(style.color), bg);
        const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
        const ratio = (light + 0.05) / (dark + 0.05);
        if (ratio < 4.5) {
          found.push(`${ratio.toFixed(2)}:1 «${(el.textContent ?? "").trim().slice(0, 30)}»`);
        }
      }
      return Array.from(new Set(found));
    });
    expect(low, `Плохо читается:\n  ${low.join("\n  ")}`).toEqual([]);
  });
}
