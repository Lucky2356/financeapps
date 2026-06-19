import type { ReactElement } from "react";
import { render } from "@testing-library/react";

import { ConfirmProvider } from "@/components/ui/confirm-dialog";

// Managers that call useConfirm() must render inside a ConfirmProvider. This
// wrapper keeps that detail out of individual tests.
export function renderWithConfirm(ui: ReactElement) {
  return render(<ConfirmProvider>{ui}</ConfirmProvider>);
}
