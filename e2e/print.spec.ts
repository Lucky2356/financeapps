import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// A printed report is something the owner shows to someone. It used to come out
// as a grey dump of the screen — and from the dark theme, as dark rectangles on
// white paper. These check the two things that made it grey: the palette the
// print sheet forces, and the browser's habit of dropping backgrounds.
test.describe("печать отчёта", () => {
  test.beforeEach(async ({ page }) => {
    await seedExampleData(page);
  });

  test("отчёт печатается на белом, в цвете и со своей шапкой", async ({ page }) => {
    await openSettled(page, "/reports");
    await page.emulateMedia({ media: "print" });

    // The cover block exists only on paper.
    const header = page.locator(".print-only").first();
    await expect(header).toBeVisible();
    await expect(header).toContainText("Финансовый отчёт");

    // Paper is white, ink is dark — whatever the app was wearing.
    const body = await page.evaluate(() => {
      const styles = getComputedStyle(document.body);
      return { background: styles.backgroundColor, color: styles.color };
    });
    expect(body.background).toBe("rgb(255, 255, 255)");
    expect(body.color).not.toBe("rgb(255, 255, 255)");

    // The category colours survive: a share bar keeps its own fill rather than
    // collapsing to grey.
    const barColour = await page.evaluate(() => {
      const bars = Array.from(document.querySelectorAll<HTMLElement>("table span[style*='width']"));
      return bars.length > 0 ? getComputedStyle(bars[0]).backgroundColor : null;
    });
    expect(barColour, "цветная полоска доли").not.toBeNull();
    expect(barColour).not.toBe("rgb(0, 0, 0)");

    // The interface around the report is gone.
    await expect(page.getByRole("button", { name: /Печать|Распечатать/ })).toBeHidden();
    await expect(page.locator("aside")).toBeHidden();
  });

  test("тёмная тема не уезжает на бумагу", async ({ page }) => {
    await openSettled(page, "/reports");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.emulateMedia({ media: "print" });

    const card = page.locator("table").first();
    const colours = await card.evaluate((node) => {
      const cell = node.querySelector("td") ?? node;
      return {
        background: getComputedStyle(document.body).backgroundColor,
        ink: getComputedStyle(cell).color
      };
    });
    expect(colours.background).toBe("rgb(255, 255, 255)");
    // Dark ink on white paper: the red channel of the text colour stays low.
    const rgb = colours.ink.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
    expect(Math.max(...rgb.slice(0, 3))).toBeLessThan(140);
  });
});
