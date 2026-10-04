import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Связь с Лоли в настройках — как на телефоне. Android здесь подменён: команды
// плагина (InstallerPlugin.kt) отвечают из памяти страницы, а каждый вызов
// записывается — видно, что тумблер не только перещёлкнулся, но и дошёл до
// телефона.

type Phone = { installed: boolean; trusted: boolean; found?: string };

async function asPhone(page: Page, phone: Phone) {
  await page.addInitScript((initial) => {
    // Телефон помнит настройку между перезагрузками страницы — как настоящий.
    const saved = sessionStorage.getItem("test-loli-phone");
    const state = saved
      ? (JSON.parse(saved) as typeof initial & { enabled: boolean; auto: boolean; share: boolean })
      : { ...initial, enabled: false, auto: false, share: true };
    const calls: Array<{ cmd: string; args: unknown }> = [];
    (window as unknown as { __loliCalls: typeof calls }).__loliCalls = calls;
    Object.defineProperty(navigator, "userAgent", {
      get: () => "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120 Mobile"
    });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      transformCallback: () => 0,
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        calls.push({ cmd, args });
        if (cmd === "plugin:installer|loli_status") {
          return {
            installed: state.installed,
            trusted: state.trusted,
            enabled: state.enabled,
            auto: state.auto,
            share: state.share,
            ...(state.found ? { found: state.found } : {})
          };
        }
        if (cmd === "plugin:installer|loli_config") {
          Object.assign(state, {
            enabled: args.enabled,
            auto: args.auto,
            share: args.share
          });
          sessionStorage.setItem("test-loli-phone", JSON.stringify(state));
          return null;
        }
        if (cmd === "plugin:installer|loli_take") return { items: "[]" };
        if (cmd === "plugin:installer|bank_status") return { granted: true };
        throw new Error(`нет такой команды: ${cmd}`);
      }
    };
  }, phone);
}

const calls = (page: Page, cmd: string) =>
  page.evaluate(
    (name) =>
      (window as unknown as { __loliCalls: Array<{ cmd: string; args: unknown }> }).__loliCalls
        .filter((call) => call.cmd === `plugin:installer|${name}`)
        .map((call) => call.args),
    cmd
  );

test("тумблер включает связь, она доходит до телефона и переживает перезаход", async ({ page }) => {
  test.setTimeout(90_000);
  await seedExampleData(page);
  await asPhone(page, { installed: true, trusted: true });
  await openSettled(page, "/settings?section=finance");

  const box = page.getByTestId("loli-settings");
  const main = box.getByRole("switch", { name: "Лоли — голосовой помощник" });
  await expect(main).toBeEnabled();
  await expect(main).not.toBeChecked();
  await expect(box.getByRole("switch", { name: "Записывать сразу" })).toHaveCount(0);

  const statusBefore = (await calls(page, "loli_status")).length;
  await main.click();
  await expect(main).toBeChecked();
  await expect
    .poll(() => calls(page, "loli_config"))
    .toContainEqual({
      enabled: true,
      auto: false,
      share: true
    });
  // Включили — обмен с Лоли начался сразу, не дожидаясь правок в учёте (в
  // «Примере» он на этом и кончается: выдуманный учёт с Лоли не делится).
  await expect
    .poll(async () => (await calls(page, "loli_status")).length)
    .toBeGreaterThan(statusBefore);

  const auto = box.getByRole("switch", { name: "Записывать сразу" });
  await auto.click();
  await expect(auto).toBeChecked();
  await expect
    .poll(() => calls(page, "loli_config"))
    .toContainEqual({
      enabled: true,
      auto: true,
      share: true
    });

  // Ушли и вернулись — состояние читается с телефона, а не из памяти экрана.
  await openSettled(page, "/settings?section=general");
  await openSettled(page, "/settings?section=finance");
  await expect(page.getByRole("switch", { name: "Лоли — голосовой помощник" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Записывать сразу" })).toBeChecked();

  // И выключается так же.
  await page.getByRole("switch", { name: "Лоли — голосовой помощник" }).click();
  await expect(page.getByRole("switch", { name: "Лоли — голосовой помощник" })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Записывать сразу" })).toHaveCount(0);
});

test("не та Лоли — тумблер серый, а рядом сказано почему и чья подпись", async ({ page }) => {
  await seedExampleData(page);
  await asPhone(page, { installed: true, trusted: false, found: "AB12…CD34" });
  await openSettled(page, "/settings?section=finance");
  const box = page.getByTestId("loli-settings");
  await expect(box.getByRole("switch", { name: "Лоли — голосовой помощник" })).toBeDisabled();
  await expect(box).toContainText("подписано не её ключом");
  await expect(box).toContainText("AB12…CD34");
});

test("Лоли нет — тумблер серый и так и сказано", async ({ page }) => {
  await seedExampleData(page);
  await asPhone(page, { installed: false, trusted: false });
  await openSettled(page, "/settings?section=finance");
  const box = page.getByTestId("loli-settings");
  await expect(box.getByRole("switch", { name: "Лоли — голосовой помощник" })).toBeDisabled();
  await expect(box).toContainText("не установлена");
  expect(await calls(page, "loli_config")).toEqual([]);
});

test("все переключатели телефона в «Финансах» включаются и выключаются на экране", async ({
  page
}) => {
  await seedExampleData(page);
  await asPhone(page, { installed: true, trusted: true });
  await openSettled(page, "/settings?section=finance");
  for (const name of [
    "Вечером напомнить записать траты",
    "Траты из уведомлений банка",
    "Лоли — голосовой помощник"
  ]) {
    const toggle = page.getByRole("switch", { name });
    const before = await toggle.isChecked();
    await toggle.click();
    await expect(toggle, name).toBeChecked({ checked: !before });
    await toggle.click();
    await expect(toggle, name).toBeChecked({ checked: before });
  }
});
