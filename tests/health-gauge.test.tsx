// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthGauge } from "@/components/charts/health-gauge";

describe("HealthGauge", () => {
  it("shows the clamped score in the centre", () => {
    const { getByText, getByLabelText } = render(<HealthGauge score={72} tone="warning" />);
    expect(getByText("72")).toBeInTheDocument();
    expect(getByLabelText("72/100")).toBeInTheDocument();
  });

  it("clamps out-of-range scores to 0..100", () => {
    const { getByText } = render(<HealthGauge score={140} tone="good" />);
    expect(getByText("100")).toBeInTheDocument();
  });

  it("renders both the track and value arcs", () => {
    const { container } = render(<HealthGauge score={50} tone="good" />);
    expect(container.querySelectorAll("circle").length).toBe(2);
  });
});
