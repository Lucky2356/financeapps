// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnimatedValue, parseShownNumber } from "@/components/ui/animated-value";
import { Expand } from "@/components/ui/expand";

// Движение чисел и раскрытия: в конце всегда ровно то, что дали.

describe("число из готовой строки", () => {
  it("сумма, дробь, минус, проценты; без цифр — нет числа", () => {
    expect(parseShownNumber("12 396,50 ₽")).toMatchObject({
      value: 12396.5,
      fraction: 2,
      after: " ₽"
    });
    expect(parseShownNumber("−1 234 ₽")?.value).toBe(-1234);
    expect(parseShownNumber("Норма 23 %")).toMatchObject({ value: 23, before: "Норма " });
    expect(parseShownNumber("•••• ₽")).toBeNull();
  });

  it("доезжает до исходной строки до последнего знака", async () => {
    const { container } = render(<AnimatedValue text={"45\u00a0000\u00a0₽"} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
    });
    expect(container.textContent).toBe("45\u00a0000\u00a0₽");
  });

  it("спрятанная сумма показывается как есть", () => {
    render(<AnimatedValue text="•••• ₽" />);
    expect(screen.getByText("•••• ₽")).toBeInTheDocument();
  });
});

describe("раскрытие", () => {
  it("закрытого нет в документе; открыли — есть; закрыли — уходит после сворачивания", async () => {
    const { rerender } = render(
      <Expand open={false}>
        <p>подробности</p>
      </Expand>
    );
    expect(screen.queryByText("подробности")).toBeNull();
    rerender(
      <Expand open>
        <p>подробности</p>
      </Expand>
    );
    expect(screen.getByText("подробности")).toBeInTheDocument();
    rerender(
      <Expand open={false}>
        <p>подробности</p>
      </Expand>
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(screen.queryByText("подробности")).toBeNull();
  });
});
