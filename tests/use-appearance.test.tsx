// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { useAppearance } from "@/hooks/use-appearance";

function Harness() {
  const { accent, setAccent } = useAppearance();
  return (
    <div>
      <span data-testid="accent">{accent}</span>
      <button type="button" onClick={() => setAccent("blue")}>
        blue
      </button>
      <button type="button" onClick={() => setAccent("emerald")}>
        emerald
      </button>
    </div>
  );
}

afterEach(() => {
  document.documentElement.removeAttribute("data-accent");
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("useAppearance", () => {
  it("updates the reported accent AND the <html> attribute together on set", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByTestId("accent").textContent).toBe("emerald");

    await user.click(screen.getByText("blue"));
    // State (drives the checkmark) and the DOM attribute (drives the colour)
    // move together — they can't desync.
    expect(screen.getByTestId("accent").textContent).toBe("blue");
    expect(document.documentElement.getAttribute("data-accent")).toBe("blue");
    expect(window.localStorage.getItem("ui-accent")).toBe("blue");
  });

  it("removes the attribute when returning to the default accent", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("blue"));
    await user.click(screen.getByText("emerald"));
    expect(screen.getByTestId("accent").textContent).toBe("emerald");
    expect(document.documentElement.getAttribute("data-accent")).toBeNull();
  });
});
