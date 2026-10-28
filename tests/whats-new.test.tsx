// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  englishReleases,
  parseChangelog,
  pickReleases,
  type WhatsNewRelease
} from "@/lib/whats-new/parse";
import generatedEn from "@/lib/whats-new/releases.generated.en.json";
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

// Английское издание того же: 3.1.0 и 3.0.0 переведены, 3.0.1 — забыт.
const SAMPLE_EN = `# Changelog (English edition)

Translation of CHANGELOG.md.

## [3.1.0] — 2026-10-02

✨ The main thing in one line.

### Added
- **New button** — does \`everything\` at once.

### Internal
- Nobody cares.

### Under the hood
- Neither here.

### For service owners
- Nor here.

## [3.0.0] — 2026-09-30

A big release.

### Changed
- Everything is different.

## [2.0.0] — 2026-01-01

Too old for the Russian list.

### Added
- Something.
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

describe("разбор английского издания", () => {
  it("служебные разделы по-английски тоже скрыты", () => {
    const [release] = parseChangelog(SAMPLE_EN);
    expect(release.sections.map((s) => s.title)).toEqual(["Added"]);
    expect(release.sections[0].items[0]).toEqual({
      lead: "New button",
      text: "— does everything at once."
    });
  });

  it("выпуск из одних «Fixed…» и «Security» — выпуск исправлений", () => {
    const [release] = parseChangelog(`## [1.0.1] — 2026-01-02

🔧 Fixed.

### Fixed — sync
- **Crashed** on start.

### Security
- Closed a hole.

### Checks
- A new guard.

### Tests
- More of them.
`);
    expect(release.kind).toBe("fixes");
    expect(release.sections.map((s) => s.title)).toEqual(["Fixed — sync", "Security"]);
  });

  it("берутся только версии из русского списка", () => {
    const english = englishReleases(SAMPLE_EN, parseChangelog(SAMPLE));
    expect(english.map((r) => r.version)).toEqual(["3.1.0", "3.0.0"]);
  });

  it("выпуск без перевода показывается по-русски, а не пропадает", () => {
    const russian = parseChangelog(SAMPLE);
    const picked = pickReleases(russian, englishReleases(SAMPLE_EN, russian));
    expect(picked.map((r) => r.version)).toEqual(["3.1.0", "3.0.1", "3.0.0"]);
    expect(picked.map((r) => r.sections[0].title)).toEqual(["Added", "Исправлено", "Changed"]);
    expect(pickReleases(russian, null)).toBe(russian);
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

  it("английский файл совпадает с разбором CHANGELOG.en.md — иначе: npm run whats-new", () => {
    const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
    const english = readFileSync(resolve(root, "CHANGELOG.en.md"), "utf8");
    expect(generatedEn).toEqual(englishReleases(english, parseChangelog(changelog)));
  });
});

// GUARD: новый выпуск пишется сразу на двух языках. Окно в английском
// интерфейсе показало бы забытый выпуск по-русски — не пропало бы, но
// английская версия перестала бы быть английской.
describe("английское издание CHANGELOG", () => {
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  const english = readFileSync(resolve(root, "CHANGELOG.en.md"), "utf8");
  const russian = parseChangelog(changelog);
  const translated = englishReleases(english, russian);

  it("у свежего выпуска CHANGELOG.md есть английская запись в CHANGELOG.en.md", () => {
    expect(translated.map((r) => r.version)).toContain(russian[0].version);
  });

  it("у текущей версии приложения — тоже", () => {
    expect(translated.map((r) => r.version)).toContain(pkgVersion);
  });

  // Перевод — того же выпуска: та же дата, тот же вид, столько же пунктов в
  // каждом разделе. Пропущенный при переводе пункт виден здесь, а не по
  // жалобе читателя.
  it("перевод повторяет выпуск: дата, вид и число пунктов по разделам", () => {
    const shape = (r: WhatsNewRelease) => ({
      version: r.version,
      date: r.date,
      kind: r.kind,
      items: r.sections.map((s) => s.items.length)
    });
    const byVersion = new Map(russian.map((r) => [r.version, r]));
    for (const release of translated) {
      expect(shape(release)).toEqual(shape(byVersion.get(release.version)!));
    }
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

  async function mount(releases: WhatsNewRelease[], english: WhatsNewRelease[] = []) {
    vi.doMock("@/lib/whats-new/releases.generated.json", () => ({ default: releases }));
    vi.doMock("@/lib/whats-new/releases.generated.en.json", () => ({ default: english }));
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

  it("коротко: пункт — одна строка, пояснение по нажатию", async () => {
    localStorage.setItem("onboarding-v2-done", "1");
    localStorage.setItem(WHATS_NEW_KEY, "3.0.1");
    await mount(parseChangelog(SAMPLE));

    const lead = await screen.findByRole("button", { name: "Новая кнопка" });
    expect(screen.queryByText(/делает всё сразу/)).toBeNull();
    await userEvent.click(lead);
    expect(screen.getByText("Делает всё сразу. Продолжение пункта.")).toBeInTheDocument();
    expect(lead).toHaveAttribute("aria-expanded", "true");
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
    // Список выпусков грузится отдельным куском — запоминается чуть позже.
    await waitFor(() => expect(localStorage.getItem(WHATS_NEW_KEY)).toBe("3.1.0"));
    expect(screen.queryByTestId("whats-new")).toBeNull();
  });

  it("по-английски — английские слова, а выпуск без перевода — по-русски", async () => {
    localStorage.setItem("app-locale", "en");
    localStorage.setItem("onboarding-v2-done", "1");
    localStorage.setItem(WHATS_NEW_KEY, "2.9.0");
    const russian = parseChangelog(SAMPLE);
    await mount(russian, englishReleases(SAMPLE_EN, russian));

    expect(await screen.findByText("What's new in 3.1.0")).toBeInTheDocument();
    expect(screen.getByText("✨ The main thing in one line.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New button" })).toBeInTheDocument();
    expect(screen.queryByText("Новая кнопка")).toBeNull();

    // 3.0.1 не переведён — раскрывается русским текстом.
    await userEvent.click(screen.getByRole("button", { name: /^3\.0\.1/ }));
    expect(screen.getByText("🔧 Починили.")).toBeInTheDocument();
    expect(screen.getByText("Падало")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^3\.0\.0/ }));
    expect(screen.getByText("Everything is different.")).toBeInTheDocument();
  });
});
