// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";

import { useIncludeTransfers } from "@/hooks/use-include-transfers";

beforeEach(() => {
  localStorage.clear();
});

// Галка «Учитывать переводы» в план/факте молча меняла и цифры на главной:
// выбор хранился один на все экраны.
it("keeps the home screen's choice apart from the reports' one", () => {
  const reports = renderHook(() => useIncludeTransfers("reports"));
  const home = renderHook(() => useIncludeTransfers("home"));

  act(() => reports.result.current[1](true));
  expect(reports.result.current[0]).toBe(true);
  expect(home.result.current[0]).toBe(false);

  act(() => home.result.current[1](true));
  act(() => reports.result.current[1](false));
  expect(home.result.current[0]).toBe(true);
  expect(reports.result.current[0]).toBe(false);
});
