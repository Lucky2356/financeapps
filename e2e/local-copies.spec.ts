import { expect, test } from "@playwright/test";

import { openSettled } from "./helpers";

// Главное устройство держит у себя копии всех данных: ежедневную — само,
// и по кнопке. Любую можно вернуть, и нынешнее перед этим тоже откладывается.

test("копии на этом устройстве: сделать и вернуть", async ({ page }) => {
  test.setTimeout(90_000);
  await openSettled(page, "/settings?section=data");

  const card = page.getByTestId("local-copies");
  await expect(card).toBeVisible();
  // Без службы устройство одно — оно и главное: ежедневная копия уже есть.
  await expect(card.getByText(/главное устройство/)).toBeVisible();
  await expect(card.getByTestId("local-copy").filter({ hasText: "ежедневная" })).toHaveCount(1, {
    timeout: 20_000
  });

  await card.getByRole("button", { name: "Сделать копию сейчас" }).click();
  await expect(page.getByText("Копия сохранена на этом устройстве")).toBeVisible();
  const manual = card.getByTestId("local-copy").filter({ hasText: "по кнопке" });
  await expect(manual).toHaveCount(1);

  await manual.getByRole("button", { name: "Вернуть" }).click();
  const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(confirm.getByText(/Вернуть данные на/)).toBeVisible();
  await confirm.getByRole("button", { name: "Вернуть" }).click();

  await expect(
    page
      .getByTestId("local-copies")
      .getByTestId("local-copy")
      .filter({ hasText: "перед возвратом" })
  ).toHaveCount(1, { timeout: 30_000 });
});
