// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Свободный лист: строка формулы и переход на другую клетку во время правки.
// Найдено разбором 2.8.3: Enter в строке формулы писал дважды и оставлял
// отметку, из-за которой следующая правка клетки, закрытая нажатием мимо, не
// сохранялась; а нажатие другой клетки возвращало выбор на правленую.

const { posts, page } = vi.hoisted(() => ({
  posts: [] as Array<Record<string, unknown>>,
  // Один и тот же объект на каждую отрисовку — как у настоящего хука, пока
  // данные не перечитаны: лист сбрасывает правки, когда данные сменились.
  page: {
    data: {
      sheets: [],
      sheet: { id: "s1", name: "Расчёты", kind: "free" },
      budget: null,
      free: { rows: 5, cols: 3, cells: [] }
    },
    ready: true,
    reload: async () => undefined
  }
}));

vi.mock("@/hooks/use-api-page-data", () => ({ useApiPageData: () => page }));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    post: async (_path: string, body: Record<string, unknown>) => {
      posts.push(body);
      return {};
    }
  }
}));

import { FreeSheet } from "@/components/sheet/free-sheet";
import { I18nProvider } from "@/lib/i18n/context";

function cell(address: string) {
  return document.querySelector(`td[data-cell="${address}"]`) as HTMLElement;
}

function writes() {
  return posts.filter((body) => body.action === "setFree");
}

// В jsdom нет PointerEvent — без него у события нажатия нет `button`.
if (!("PointerEvent" in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

beforeEach(() => {
  localStorage.setItem("app-locale", "ru");
  posts.length = 0;
});

describe("строка формулы и выбор клетки", () => {
  it("Enter в строке формулы пишет один раз, и следующая правка клетки сохраняется", async () => {
    render(
      <I18nProvider>
        <FreeSheet sheetId="s1" onChanged={() => undefined} />
      </I18nProvider>
    );
    fireEvent.pointerDown(cell("A1"), { button: 0 });
    const bar = screen.getByTestId("free-formula-bar");
    await act(async () => {
      bar.focus();
      fireEvent.change(bar, { target: { value: "5" } });
    });
    await act(async () => {
      fireEvent.keyDown(bar, { key: "Enter" });
    });
    expect(writes()).toHaveLength(1);
    expect(screen.getByTestId("free-address")).toHaveTextContent("A2");

    // На A2 — правка в клетке, закрытая нажатием на другую клетку.
    const grid = screen.getByTestId("free-grid");
    await act(async () => {
      fireEvent.keyDown(grid, { key: "7" });
    });
    const editor = screen.getByLabelText("A2", { selector: "input" });
    await act(async () => {
      fireEvent.pointerDown(cell("C3"), { button: 0 });
      fireEvent.blur(editor);
    });
    expect(writes().at(-1)).toMatchObject({ cells: [{ r: 1, c: 0, input: "7" }] });
    // И выбор — там, куда нажали, а не на правленой клетке.
    expect(screen.getByTestId("free-address")).toHaveTextContent("C3");
  });
});
