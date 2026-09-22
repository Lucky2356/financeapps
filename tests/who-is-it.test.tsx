// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Настоящий runtime тянет хранилище устройства и Tauri; проверяется здесь
// экран, а не они.
const { moved } = vi.hoisted(() => ({ moved: { to: null as string | null, added: "" } }));

vi.mock("@/lib/vault/runtime", () => ({
  switchPerson: async (id: string) => {
    moved.to = id;
  },
  addPersonAndSwitch: async (name: string) => {
    moved.added = name;
  }
}));

import { I18nProvider } from "@/lib/i18n/context";
import { WhoIsIt } from "@/components/vault/who-is-it";

// Язык закрепляется явно, и это не подгонка под проверку.
//
// Приложение берёт язык из системы, а у jsdom она английская — экран отвечал
// бы по-английски, и проверка искала бы то, чего на нём нет. Ровно этой
// западнёй был потерян целый прогон швов собранного приложения: там
// приложение открылось «Where do we start?» вместо «С чего начнём?».
beforeEach(() => {
  localStorage.setItem("app-locale", "ru");
});

function show(people: { id: string; name: string; unprotected: boolean }[]) {
  return render(
    <I18nProvider>
      <WhoIsIt people={people} />
    </I18nProvider>
  );
}

describe("экран «кто за компьютером»", () => {
  it("говорит вслух, чьи данные сосед откроет без пароля", async () => {
    // Это главное, что экран обязан сказать. Разделение честно ровно
    // настолько, насколько заперты данные: у человека без пароля ключ лежит в
    // хранилище открытым — по замыслу. Промолчи экран, и обещание «друг друга
    // вы не видите» стало бы обещанием защиты, которой нет.
    show([
      { id: "", name: "Вася", unprotected: true },
      { id: "маша", name: "Маша", unprotected: false }
    ]);

    expect(await screen.findByText("Без пароля — сосед откроет")).toBeInTheDocument();
    expect(screen.getByText("Под паролем")).toBeInTheDocument();
  });

  it("предупреждение стоит у того, к кому относится", async () => {
    // Мелким шрифтом внизу оно не читается вовсе. На плитке — читается тем,
    // кто как раз собирается на неё нажать.
    show([
      { id: "", name: "Вася", unprotected: true },
      { id: "маша", name: "Маша", unprotected: false }
    ]);

    const vasya = (await screen.findByText("Вася")).closest("button");
    expect(vasya).toHaveTextContent("Без пароля — сосед откроет");
    expect(vasya).not.toHaveTextContent("Под паролем");
  });

  it("нажатие на плитку открывает именно этого человека", async () => {
    show([
      { id: "", name: "Вася", unprotected: false },
      { id: "маша", name: "Маша", unprotected: false }
    ]);
    moved.to = null;

    await userEvent.click(await screen.findByText("Маша"));

    expect(moved.to).toBe("маша");
  });

  it("новый человек заводится с именем, которое ввели", async () => {
    show([
      { id: "", name: "Вася", unprotected: false },
      { id: "маша", name: "Маша", unprotected: false }
    ]);

    await userEvent.click(await screen.findByText("Добавить человека"));
    await userEvent.type(screen.getByPlaceholderText("Например, Маша"), "Петя");
    await userEvent.click(screen.getByRole("button", { name: "Готово" }));

    expect(moved.added).toBe("Петя");
  });

  it("поле имени пустое при каждом открытии", async () => {
    // Иначе в нём лежало бы имя предыдущей попытки — чужое имя, подставленное
    // молча тому, кто заводит себя.
    show([
      { id: "", name: "Вася", unprotected: false },
      { id: "маша", name: "Маша", unprotected: false }
    ]);

    await userEvent.click(await screen.findByText("Добавить человека"));
    await userEvent.type(screen.getByPlaceholderText("Например, Маша"), "Петя");
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    await userEvent.click(screen.getByText("Добавить человека"));

    expect(screen.getByPlaceholderText("Например, Маша")).toHaveValue("");
  });
});
