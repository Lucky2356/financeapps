// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Экран «Данные уже есть на другом устройстве» — тот, куда человек попадает
// первым делом, заведя второго человека или поставив приложение на телефон.
//
// До 1.46.0 он спрашивал адрес службы. Владелец описал это одной фразой:
// «откуда обычный человек знает имя сервера и что это такое». Код связки был
// сделан в настройках — а сюда, на первый экран, не донесён.

const { calls } = vi.hoisted(() => ({
  calls: { signIn: null as null | { base: string; login: string }, redeemed: ["", ""] }
}));

vi.mock("@/lib/vault/runtime", () => ({
  accountService: { adopt: async () => undefined },
  flushSync: async () => undefined,
  refuseSharedServerAccount: async () => undefined,
  rememberMyServer: async () => undefined,
  resumeSync: async () => undefined,
  serverAccount: {
    signIn: async (input: { base: string; login: string }) => {
      calls.signIn = { base: input.base, login: input.login };
      return { vault: {} };
    }
  }
}));

vi.mock("@/lib/api/client", () => ({ apiClient: { post: async () => undefined } }));

vi.mock("@/lib/vault/server-account", () => ({
  redeemPairing: async (base: string, code: string) => {
    calls.redeemed = [base, code];
    return { base: "https://finance.zagranica.online", login: "маша" };
  }
}));

vi.mock("@/lib/sync/scan-qr", () => ({
  cameraPossible: () => false,
  scanQr: async () => ({ ok: false, why: "absent" })
}));

import { I18nProvider } from "@/lib/i18n/context";
import { FirstRun } from "@/components/vault/first-run";

beforeEach(() => {
  localStorage.setItem("app-locale", "ru");
  calls.signIn = null;
  calls.redeemed = ["", ""];
});

async function openJoin() {
  const user = userEvent.setup();
  render(
    <I18nProvider>
      <FirstRun onDone={() => undefined} />
    </I18nProvider>
  );
  await user.click(await screen.findByText("Данные уже есть на другом устройстве"));
  return user;
}

describe("забрать данные с другого устройства", () => {
  it("начинается с кода связки, а не с адреса службы", async () => {
    await openJoin();

    expect(screen.getByLabelText("Код связки")).toBeInTheDocument();
    expect(screen.queryByLabelText("Адрес службы")).toBeNull();
    // И говорит, где этот код взять: иначе поле ничем не лучше адреса.
    expect(screen.getByText(/Связать ещё одно устройство/)).toBeInTheDocument();
  });

  it("код приносит адрес и имя — остаётся только пароль", async () => {
    const user = await openJoin();

    await user.type(screen.getByLabelText("Код связки"), "abcd-efgh");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(await screen.findByText(/маша/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Имя входа")).toBeNull();
    expect(screen.queryByLabelText("Адрес службы")).toBeNull();

    await user.type(screen.getByLabelText("Пароль от ваших данных"), "пароль-маши");
    await user.click(screen.getByRole("button", { name: "Забрать данные" }));
    expect(calls.signIn).toEqual({ base: "https://finance.zagranica.online", login: "маша" });
  });

  it("по имени и паролю — без адреса: он зашит в сборку", async () => {
    const user = await openJoin();

    await user.click(screen.getByRole("button", { name: "Войти по имени и паролю" }));
    expect(screen.queryByLabelText("Адрес службы")).toBeNull();

    await user.type(screen.getByLabelText("Имя входа"), "петя");
    await user.type(screen.getByLabelText("Пароль от ваших данных"), "пароль-пети");
    await user.click(screen.getByRole("button", { name: "Забрать данные" }));
    expect(calls.signIn?.login).toBe("петя");
    expect(calls.signIn?.base).toMatch(/^https:\/\//);
  });

  it("адрес спрашивается только у того, у кого своя служба", async () => {
    const user = await openJoin();

    await user.click(screen.getByRole("button", { name: "У меня своя служба" }));
    expect(screen.getByLabelText("Адрес службы")).toBeInTheDocument();
  });

  // Жалоба владельца: выбрал «забрать с сервера» — и «тупо застревал», назад
  // было не выйти.
  it("со связки можно вернуться назад, к выбору", async () => {
    const user = await openJoin();
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByText("Данные уже есть на другом устройстве")).toBeInTheDocument();
  });
});

describe("выход к выбору человека", () => {
  it("есть, когда на устройстве есть к кому вернуться", async () => {
    let left = false;
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <FirstRun onDone={() => undefined} onLeave={() => (left = true)} />
      </I18nProvider>
    );
    await user.click(await screen.findByRole("button", { name: "Выбрать другого человека" }));
    expect(left).toBe(true);
  });

  it("нет, когда человек на устройстве один", async () => {
    render(
      <I18nProvider>
        <FirstRun onDone={() => undefined} />
      </I18nProvider>
    );
    await screen.findByText("Данные уже есть на другом устройстве");
    expect(screen.queryByRole("button", { name: "Выбрать другого человека" })).toBeNull();
  });
});
