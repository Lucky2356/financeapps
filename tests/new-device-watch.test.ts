import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vault/runtime", () => ({ serverAccount: {} }));

import { newDevices } from "@/components/sync/new-device-watch";

// Кого называть «новым устройством». Молчать при первом взгляде — всё, что
// уже есть, своё; молчать о себе; говорить о каждом, кого раньше не было.

const phone = { id: "d-phone", name: "Телефон (Android)" };
const laptop = { id: "d-laptop", name: "Компьютер (Windows)" };
const stranger = { id: "d-x", name: "Чужой телефон" };

describe("новое устройство", () => {
  it("в первый раз не называет никого: сравнивать не с чем", () => {
    expect(newDevices(null, "u-1", [phone, laptop], "d-laptop")).toEqual([]);
  });

  it("называет того, кого раньше не было, и не называет себя", () => {
    const before = { login: "u-1", ids: ["d-laptop", "d-phone"] };
    expect(newDevices(before, "u-1", [phone, laptop, stranger], "d-laptop")).toEqual([stranger]);
  });

  it("после смены записи на службе всё начинается заново", () => {
    const before = { login: "u-old", ids: ["d-laptop"] };
    expect(newDevices(before, "u-new", [laptop, phone], "d-laptop")).toEqual([]);
  });
});
