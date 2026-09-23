// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Настоящий runtime тянет хранилище устройства и Tauri; проверяется здесь
// экран, а не они.
const { calls, state } = vi.hoisted(() => ({
  calls: { added: "", switched: "", renamed: ["", ""] as [string, string] },
  state: {
    people: [] as Array<{ id: string; name: string; unprotected: boolean }>,
    me: ""
  }
}));

vi.mock("@/lib/vault/runtime", () => ({
  listPeople: async () => state.people,
  currentPersonId: async () => state.me,
  addPersonAndSwitch: async (name: string) => {
    calls.added = name;
  },
  switchPerson: async (id: string) => {
    calls.switched = id;
  },
  renamePersonHere: async (id: string, name: string) => {
    calls.renamed = [id, name];
  }
}));

import { I18nProvider } from "@/lib/i18n/context";
import { PeoplePanel } from "@/components/settings/people-panel";

// Язык закрепляется явно: у jsdom система английская, и экран отвечал бы
// по-английски. Той же западнёй был потерян целый прогон швов.
beforeEach(() => {
  localStorage.setItem("app-locale", "ru");
  calls.added = "";
  calls.switched = "";
  calls.renamed = ["", ""];
  state.people = [{ id: "", name: "Человек 1", unprotected: false }];
  state.me = "";
});

function show() {
  return render(
    <I18nProvider>
      <PeoplePanel />
    </I18nProvider>
  );
}

describe("«Люди на этом устройстве» в настройках", () => {
  it("показывается и тому, кто на устройстве один", async () => {
    // Это главное. Возможность «двое на одном устройстве» была выпущена, а
    // войти в неё было неоткуда: завести человека умеет экран «Кто за
    // компьютером?», а тот показывается, только когда людей УЖЕ больше одного.
    // Курица и яйцо: чтобы завести второго, нужен второй.
    show();

    expect(await screen.findByText("Человек 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить человека" })).toBeInTheDocument();
  });

  it("заводит человека с тем именем, которое ввели", async () => {
    show();

    await userEvent.click(await screen.findByRole("button", { name: "Добавить человека" }));
    await userEvent.type(screen.getByPlaceholderText("Например, Маша"), "Маша");
    await userEvent.click(screen.getByRole("button", { name: "Готово" }));

    expect(calls.added).toBe("Маша");
  });

  it("поле имени пустое при каждом открытии", async () => {
    // Иначе в нём лежало бы имя предыдущей попытки — чужое имя, подставленное
    // молча тому, кто заводит себя.
    show();

    await userEvent.click(await screen.findByRole("button", { name: "Добавить человека" }));
    await userEvent.type(screen.getByPlaceholderText("Например, Маша"), "Петя");
    await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
    await userEvent.click(screen.getByRole("button", { name: "Добавить человека" }));

    expect(screen.getByPlaceholderText("Например, Маша")).toHaveValue("");
  });

  it("говорит, чьи данные сосед откроет без пароля", async () => {
    // Ровно то же, что говорит экран выбора, и по той же причине: разделение
    // честно настолько, насколько заперты данные.
    state.people = [
      { id: "", name: "Вася", unprotected: true },
      { id: "маша", name: "Маша", unprotected: false }
    ];
    show();

    expect(await screen.findByText("Без пароля — сосед откроет")).toBeInTheDocument();
    expect(screen.getByText("Под паролем")).toBeInTheDocument();
  });

  it("помечает того, кто сейчас за компьютером, и не предлагает открыть его же", async () => {
    state.people = [
      { id: "", name: "Вася", unprotected: false },
      { id: "маша", name: "Маша", unprotected: false }
    ];
    state.me = "";
    show();

    const vasya = (await screen.findByText("Вася")).closest("li");
    const masha = screen.getByText("Маша").closest("li");

    expect(vasya).toHaveTextContent("это вы");
    expect(masha).not.toHaveTextContent("это вы");
    // Открывать себя нечего: нажатие перезагрузило бы приложение впустую.
    expect(vasya?.querySelector("button")?.textContent).not.toBe("Открыть");
  });

  it("открывает именно того, на ком нажали", async () => {
    state.people = [
      { id: "", name: "Вася", unprotected: false },
      { id: "маша", name: "Маша", unprotected: false }
    ];
    state.me = "";
    show();

    await userEvent.click(await screen.findByRole("button", { name: "Открыть" }));

    expect(calls.switched).toBe("маша");
  });

  it("переименовывает: «Человек 1» не обязан оставаться им навсегда", async () => {
    // Имя первому человеку никто не давал — оно выдано списком, когда рядом
    // появился второй. Оставить его несменяемым значило бы, что тот, кто был
    // на устройстве первым, навсегда подписан номером.
    show();

    await userEvent.click(await screen.findByRole("button", { name: "Переименовать" }));
    const field = screen.getByLabelText("Имя");
    await userEvent.clear(field);
    await userEvent.type(field, "Вася");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(calls.renamed).toEqual(["", "Вася"]);
  });
});
