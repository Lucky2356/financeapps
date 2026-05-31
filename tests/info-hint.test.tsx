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
});
