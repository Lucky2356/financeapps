// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Новый телефон открыли ссылкой из QR — обычной камерой, не из приложения.
// Первый экран не спрашивает, «с чего начнём»: подключается по этой ссылке сам.

const LINK =
  "financeapps://pair?s=https%3A%2F%2Ffinance.zagranica.online&c=ABCD2345&k=" + "a".repeat(43);

const { joined } = vi.hoisted(() => ({ joined: [] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })
}));
vi.mock("@/lib/sync/incoming-link", () => ({ takeIncomingLink: async () => LINK }));
vi.mock("@/lib/vault/runtime", () => ({
  accountService: {},
  joinWithLink: async (raw: string) => {
    joined.push(raw);
  },
  requestPairing: async () => new Promise(() => undefined),
  checkPairingRequest: async () => false,
  serverAccount: {}
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: async () => undefined } }));
vi.mock("@/lib/sync/scan-qr", () => ({
  cameraPossible: () => true,
  scanQr: async () => ({ ok: false, why: "absent" })
}));

import { I18nProvider } from "@/lib/i18n/context";
import { FirstRun } from "@/components/vault/first-run";

beforeEach(() => {
  localStorage.setItem("app-locale", "ru");
  joined.length = 0;
});

describe("ссылка из QR на первом экране", () => {
  it("подключает по ней сразу, без выбора и без камеры", async () => {
    render(
      <I18nProvider>
        <FirstRun onDone={() => undefined} />
      </I18nProvider>
    );
    await waitFor(() => expect(joined).toEqual([LINK]));
  });
});
