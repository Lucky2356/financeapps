// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseChangelog, type WhatsNewRelease } from "@/lib/whats-new/parse";
import generated from "@/lib/whats-new/releases.generated.json";
import { decideWhatsNew, MAX_RELEASES, WHATS_NEW_KEY } from "@/lib/whats-new/seen";
import { updateTeaser } from "@/lib/updates/latest";

// «Что нового» — один раз после обновления, словами из CHANGELOG.

const root = resolve(__dirname, "..");
const pkgVersion = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;

const SAMPLE = `# Changelog

## [Unreleased]

## [3.1.0] — 2026-10-02

✨ Главное одной строкой,
на две строки.

### Добавлено
- **Новая кнопка** — делает \`всё\` сразу.
  Продолжение пункта.
- Пункт без жирного.

### Внутреннее
- Никому не интересно.

## [3.0.1] — 2026-10-01

🔧 Починили.

### Исправлено
- **Падало** при старте.

### Проверки
- Новый сторож.

## [3.0.0] — 2026-09-30

Большой выпуск.

### Изменено
- Всё иначе.
`;

describe("разбор CHANGELOG", () => {
  const releases = parseChangelog(SAMPLE);

  it("берёт выпуски по порядку, без [Unreleased]", () => {
    expect(releases.map((r) => r.version)).toEqual(["3.1.0", "3.0.1", "3.0.0"]);
    expect(releases[0].date).toBe("2026-10-02");
  });

  it("строка-итог — первый абзац, одной строкой", () => {
    expect(releases[0].summary).toBe("✨ Главное одной строкой, на две строки.");
  });

  it("жирное — главное, разметка снята, продолжение склеено", () => {
    expect(releases[0].sections[0].items[0]).toEqual({
      lead: "Новая кнопка",
      text: "— делает всё сразу. Продолжение пункта."
    });
    expect(releases[0].sections[0].items[1]).toEqual({ lead: "", text: "Пункт без жирного." });
  });

  it("разделы для разработчиков и службы людям не показываются", () => {
    expect(releases[0].sections.map((s) => s.title)).toEqual(["Добавлено"]);
    expect(releases[1].sections.map((s) => s.title)).toEqual(["Исправлено"]);
  });

  it("выпуск только с исправлениями так и помечен", () => {
    expect(releases.map((r) => r.kind)).toEqual(["features", "fixes", "features"]);
  });
});

describe("файл для приложения не отстал от CHANGELOG", () => {
  it("совпадает с разбором CHANGELOG — иначе: npm run whats-new", () => {
    const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
    expect(generated).toEqual(parseChangelog(changelog));
  });

  it("в нём есть текущая версия — окну будет что показать", () => {
    expect((generated as WhatsNewRelease[]).some((r) => r.version === pkgVersion)).toBe(true);
  });
});

describe("когда показывать", () => {
  const releases = parseChangelog(SAMPLE);

  it("новая установка молчит и запоминает версию", () => {
    expect(decideWhatsNew({ seen: null, current: "3.1.0", onboarded: false, releases })).toEqual({
      show: false,
      remember: true
    });
  });

  it("пока идёт обучение — не поверх него", () => {
    expect(decideWhatsNew({ seen: "3.0.0", current: "3.1.0", onboarded: false, releases })).toEqual(
      { show: false, remember: false }
    );
  });

  it("обновился с версии без этого окна — только текущий выпуск", () => {
    const decision = decideWhatsNew({ seen: null, current: "3.1.0", onboarded: true, releases });
    expect(decision.show && decision.releases.map((r) => r.version)).toEqual(["3.1.0"]);
  });

  it("пропустил выпуски — видит все, новый первым", () => {
    const decision = decideWhatsNew({
      seen: "2.9.0",
      current: "3.1.0",
      onboarded: true,
      releases
    });
    expect(decision.show && decision.releases.map((r) => r.version)).toEqual([
      "3.1.0",
      "3.0.1",
      "3.0.0"
    ]);
  });

  it("уже видел — ничего", () => {
    expect(decideWhatsNew({ seen: "3.1.0", current: "3.1.0", onboarded: true, releases })).toEqual({
      show: false,
      remember: false
    });
  });

  it("не больше пяти выпусков разом", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...releases[0],
      version: `4.${i}.0`
    }));
    const decision = decideWhatsNew({
      seen: "3.1.0",
      current: "4.8.0",
      onboarded: true,
      releases: many
    });
    expect(decision.show && decision.releases).toHaveLength(MAX_RELEASES);
  });
});

describe("строка «что нового» перед обновлением", () => {
  it("первый абзац, без разметки и заголовков", () => {
    expect(updateTeaser("🚀 **Коротко** и `ясно`.\n\n### Добавлено\n- много")).toBe(
      "🚀 Коротко и ясно."
    );
  });

  it("длинное обрезается", () => {
    const teaser = updateTeaser("а".repeat(400));
    expect(teaser.length).toBe(160);
    expect(teaser.endsWith("…")).toBe(true);
  });
});

describe("окно", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-locale", "ru");
    vi.resetModules();
  });

  async function mount(releases: WhatsNewRelease[]) {
    vi.doMock("@/lib/whats-new/releases.generated.json", () => ({ default: releases }));
    vi.doMock("@/lib/constants", async (original) => ({
      ...(await original<typeof import("@/lib/constants")>()),
      APP_VERSION: releases[0].version
    }));
    const { WhatsNew } = await import("@/components/whats-new");
    const { I18nProvider } = await import("@/lib/i18n/context");
    await act(async () => {
      render(
        <I18nProvider>
          <WhatsNew />
        </I18nProvider>
      );
    });
  }

  it("после обновления показывает один раз", async () => {
    localStorage.setItem("onboarding-v2-done", "1");
    localStorage.setItem(WHATS_NEW_KEY, "3.0.1");
    await mount(parseChangelog(SAMPLE));

    expect(await screen.findByText("Что нового в 3.1.0")).toBeInTheDocument();
    expect(screen.getByText("Новая кнопка")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Понятно" }));
    expect(localStorage.getItem(WHATS_NEW_KEY)).toBe("3.1.0");
  });

  it("выпуск исправлений называется «Исправления в …»", async () => {
    localStorage.setItem("onboarding-v2-done", "1");
    localStorage.setItem(WHATS_NEW_KEY, "3.0.0");
    await mount(parseChangelog(SAMPLE).slice(1));

    expect(await screen.findByText("Исправления в 3.0.1")).toBeInTheDocument();
    expect(screen.getByText("Падало")).toBeInTheDocument();
  });

  it("новая установка окна не видит", async () => {
    await mount(parseChangelog(SAMPLE));
    expect(screen.queryByTestId("whats-new")).toBeNull();
    expect(localStorage.getItem(WHATS_NEW_KEY)).toBe("3.1.0");
  });
});
