// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ConfirmProvider, useConfirm } from "@/components/ui/confirm-dialog";

function Harness() {
  const confirm = useConfirm();
  const [result, setResult] = useState<string>("idle");

  return (
    <div>
      <button
        onClick={async () => {
          const ok = await confirm({
            title: "Удалить элемент?",
            description: "Действие необратимо.",
            confirmLabel: "Удалить",
            destructive: true
          });
          setResult(ok ? "confirmed" : "cancelled");
        }}
      >
        trigger
      </button>
      <span data-testid="result">{result}</span>
    </div>
  );
}

function setup() {
  return render(
    <ConfirmProvider>
      <Harness />
    </ConfirmProvider>
  );
}

describe("ConfirmProvider / useConfirm", () => {
  it("resolves true when the confirm action is clicked", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "trigger" }));
    expect(await screen.findByText("Удалить элемент?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Удалить" }));

    expect(await screen.findByTestId("result")).toHaveTextContent("confirmed");
  });

  it("resolves false when the cancel action is clicked", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "trigger" }));
    await user.click(await screen.findByRole("button", { name: "Отмена" }));

    expect(await screen.findByTestId("result")).toHaveTextContent("cancelled");
  });

  it("throws when used outside a provider", () => {
    function Orphan() {
      useConfirm();
      return null;
    }
    // Suppress the expected React error boundary console noise.
    expect(() => render(<Orphan />)).toThrow(/ConfirmProvider/);
  });
});
