// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sparkline } from "@/components/charts/sparkline";

describe("Sparkline", () => {
  it("renders a line path for two or more points", () => {
    const { container } = render(<Sparkline values={[1, 5, 3, 8]} />);
    const paths = container.querySelectorAll("path");
    // Area fill + line stroke.
    expect(paths.length).toBe(2);
    expect(paths[1].getAttribute("d")).toMatch(/^M/);
  });

  it("renders nothing with fewer than two points", () => {
    const { container } = render(<Sparkline values={[42]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("handles a flat series without dividing by zero", () => {
    const { container } = render(<Sparkline values={[5, 5, 5]} />);
    const line = container.querySelectorAll("path")[1];
    // No NaN coordinates when min === max.
    expect(line.getAttribute("d")).not.toMatch(/NaN/);
  });
});
