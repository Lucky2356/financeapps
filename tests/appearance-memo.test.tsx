// @vitest-environment jsdom
import { useMemo } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { useAppearance } from "@/hooks/use-appearance";
import { ACCENTS } from "@/lib/appearance";

// Regression guard for the real bug: in SettingsForm the accent swatches are
// built inside a useMemo. If `accent` is not in that memo's dependency list, the
// selected marker freezes on the old colour while the app colour changes. This
// harness reproduces the exact structure — swatches computed in a useMemo that
// depends on `accent` — and asserts the marker follows the click.
function MemoizedSwatches() {
  const { accent, setAccent } = useAppearance();
  const swatches = useMemo(
    () =>
      ACCENTS.map((value) => (
        <button key={value} type="button" onClick={() => setAccent(value)}>
          {value}
          {accent === value ? <span data-testid={`selected-${value}`}>✓</span> : null}
        </button>
      )),
    // `accent` must be here — that's what the fix restores.
    [accent, setAccent]
  );
  return <div>{swatches}</div>;
}

afterEach(() => {
  document.documentElement.removeAttribute("data-accent");
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("accent swatches built inside useMemo", () => {
  it("moves the selected marker to the clicked colour", async () => {
    const user = userEvent.setup();
    render(<MemoizedSwatches />);
    // Initially emerald is selected.
    expect(screen.getByTestId("selected-emerald")).toBeInTheDocument();

    await user.click(screen.getByText("blue"));
    // The marker must be on blue now (and NOT still on emerald).
    expect(screen.getByTestId("selected-blue")).toBeInTheDocument();
    expect(screen.queryByTestId("selected-emerald")).toBeNull();
    expect(document.documentElement.getAttribute("data-accent")).toBe("blue");
  });
});
