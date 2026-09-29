import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Фото чека у операции: скрепка в строке, снимок сжимается и открывается,
// удаляется одной кнопкой.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("прикрепить, посмотреть и удалить фото чека", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");

  await page.getByTestId("tx-photo").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Фото чека", { exact: true })).toBeVisible();
  await dialog
    .getByTestId("receipt-photo-input")
    .setInputFiles({ name: "check.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByTestId("receipt-photo")).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByTestId("receipt-photo")).toHaveAttribute("src", /^data:image\/jpeg/);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Есть фото чека" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Есть фото чека" }).first().click();
  await expect(dialog.getByTestId("receipt-photo")).toBeVisible();
  await dialog.getByRole("button", { name: "Удалить фото" }).click();
  await expect(page.getByText("Фото удалено.")).toBeVisible();
  await expect(dialog.getByTestId("receipt-photo")).toBeHidden();
});
