// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NoteField } from "@/components/plan/plan-fact-view/table-cells";

// Заметка месяца в план/факт: поле держит набранное, но не должно затирать
// заметку, которая тем временем приехала с другого устройства.

function field() {
  return screen.getByPlaceholderText("заметка") as HTMLInputElement;
}

describe("заметка месяца", () => {
  it("набранное записывается при уходе из поля", () => {
    const onSave = vi.fn();
    render(<NoteField initial="старая" placeholder="заметка" onSave={onSave} />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "новая" } });
    fireEvent.blur(field());
    expect(onSave).toHaveBeenCalledWith("новая");
  });

  it("приехала другая заметка — поле её показывает, касание без правки ничего не пишет", () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <NoteField initial="с телефона" placeholder="заметка" onSave={onSave} />
    );
    rerender(<NoteField initial="с компьютера" placeholder="заметка" onSave={onSave} />);
    expect(field().value).toBe("с компьютера");

    fireEvent.focus(field());
    fireEvent.blur(field());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("пока в поле пишут, приехавшая заметка набранное не стирает", () => {
    const onSave = vi.fn();
    const { rerender } = render(<NoteField initial="" placeholder="заметка" onSave={onSave} />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "пишу" } });
    rerender(<NoteField initial="чужая" placeholder="заметка" onSave={onSave} />);
    expect(field().value).toBe("пишу");
    fireEvent.blur(field());
    expect(onSave).toHaveBeenCalledWith("пишу");
  });

  it("после записи перечитанная заметка совпадает с набранной — поле не мигает старой", () => {
    const onSave = vi.fn();
    const { rerender } = render(<NoteField initial="а" placeholder="заметка" onSave={onSave} />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: "б" } });
    fireEvent.blur(field());
    expect(field().value).toBe("б");
    rerender(<NoteField initial="б" placeholder="заметка" onSave={onSave} />);
    expect(field().value).toBe("б");
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
