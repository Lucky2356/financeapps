// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { InfoHint } from "@/components/info-hint";

describe("InfoHint", () => {
  it("toggles the hint text on click and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<InfoHint text="Пояснение термина" />);

    expect(screen.queryByText("Пояснение термина")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Пояснение" }));
    expect(screen.getByText("Пояснение термина")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Пояснение термина")).not.toBeInTheDocument();
  });

  it("renders the hint in a document body portal so cards cannot clip it", async () => {
    const user = userEvent.setup();
    render(
      <div style={{ height: 24, overflow: "hidden", width: 24 }}>
        <InfoHint text="Портальная подсказка" />
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Пояснение" }));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Портальная подсказка");
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveClass("fixed");
  });
});
