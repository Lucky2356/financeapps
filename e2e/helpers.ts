import { expect, type Page } from "@playwright/test";

// Fills the device storage with the built-in example through the app's own
// onboarding button. Empty screens hide the interesting cases: it is tables,
// charts and long category names that overflow, and they only exist with data.
export async function seedExampleData(page: Page) {
  await page.goto("/");
  await loadExample(page);
}

// The same click, on a page that is already open and already unlocked. Split
// out because the lock screen appears on a fresh navigation (the book key lives
// in the tab's memory), so a test that is mid-flow cannot afford the goto above.
export async function loadExample(page: Page) {
  const button = page.getByRole("button", { name: "Загрузить пример" });

  // Сначала — не «дождаться кнопки», а РАЗЛИЧИТЬ два исхода.
  //
  // Снимок устройства с заведённым замком приезжает во вкладку не нашими
  // руками: IndexedDB восстанавливает из storageState сам Playwright, и раз на
  // много сотен прогонов это не срабатывает. Вкладка тогда открывается как
  // новое устройство, ворота показывают первый запуск — и кнопки «Загрузить
  // пример» на экране нет и не будет никогда.
  //
  // Жди мы одну кнопку, это выглядело бы как «кнопка не появилась» и
  // разбиралось бы по тридцатисекундному таймауту с пустой подсказкой. Ворота
  // при этом безопасно спрашивать: «первый запуск» и «заперто» — состояния
  // КОНЕЧНЫЕ, до них ворота показывают пустоту, так что мелькнуть мимо них
  // нельзя и ложной тревоги здесь не будет.
  const gate = page.getByRole("heading", {
    name: /С чего начнём\?|Защитить данные паролем\?|Данные заперты/
  });

  let outcome = "ждём";
  await expect
    .poll(
      async () => {
        if (await button.isVisible()) return (outcome = "готово");
        if (await gate.isVisible()) return (outcome = "замок");
        return (outcome = "ждём");
      },
      { timeout: 30_000 }
    )
    .not.toBe("ждём");

  expect(
    outcome,
    "Книги в хранилище вкладки не оказалось: снимок замка не доехал, приложение открылось как на новом устройстве"
  ).toBe("готово");

  await button.waitFor({ state: "visible", timeout: 30_000 });

  // Stamp the window before clicking: the app reloads itself once the example is
  // written to IndexedDB, and a reload wipes the stamp. Waiting for it to vanish
  // is the only signal that tells "the reload already happened" apart from "the
  // reload is about to happen" — and navigating in that gap used to land the
  // next test on the home screen instead of the route it asked for.
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__seedMark = true;
  });
  await button.click();
  await expect(button).toBeHidden({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        page
          .evaluate(() => (window as unknown as Record<string, unknown>).__seedMark ?? null)
          .catch(() => null),
      { timeout: 30_000 }
    )
    .toBeNull();
}

// Seeding ends with the app reloading ITSELF, and that reload lands whenever it
// lands — so a navigation started right after can be aborted, or overtaken by
// the reload. Both read as a navigation error rather than a failed page.
const NAVIGATION_RACE = /ERR_ABORTED|interrupted by another navigation/;

// Opens a route and lets the client swap the empty server shell for real data.
export async function openSettled(page: Page, route: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(route);
      break;
    } catch (error) {
      if (attempt >= 4 || !NAVIGATION_RACE.test(String(error))) throw error;
      await page.waitForTimeout(500);
    }
  }
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  // Charts and lazy panels mount a frame or two after hydration; layout
  // assertions are a snapshot, so give them time to settle.
  await page.waitForTimeout(1_500);
}
