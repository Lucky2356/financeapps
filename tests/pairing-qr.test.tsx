// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PairingQr } from "@/components/vault/pairing-qr";
import { makePairingLink, readPairing } from "@/lib/sync/pairing-link";

const LINK = makePairingLink("https://finance.example.org", "ABCD2345");

describe("картинка связки", () => {
  it("рисуется и не пуста", () => {
    render(<PairingQr value={LINK} />);
    const svg = screen.getByTestId("pairing-qr");

    expect(svg).toBeInTheDocument();
    const path = svg.querySelector("path");
    expect(path?.getAttribute("d")?.length ?? 0).toBeGreaterThan(100);
  });

  it("поле белое, модули чёрные — и от темы это не зависит", () => {
    // Не недосмотр темы. Читалки ожидают тёмное на светлом; обратную
    // полярность берут не все, а какая камера попадётся человеку — неизвестно.
    render(<PairingQr value={LINK} />);
    const svg = screen.getByTestId("pairing-qr");

    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("#ffffff");
    expect(svg.querySelector("path")?.getAttribute("fill")).toBe("#000000");
  });

  it("по краю есть поле тишины", () => {
    // Четыре модуля по краю — требование формата. Без них читалка не находит
    // границу кода, и это ровно та поломка, что проявляется не на всех
    // телефонах: на одном читается, на другом нет.
    render(<PairingQr value={LINK} />);
    const svg = screen.getByTestId("pairing-qr");
    const side = Number(svg.getAttribute("viewBox")?.split(" ")[3]);

    // Ни один модуль не стоит ближе четырёх к краю.
    const coords = [
      ...(svg.querySelector("path")?.getAttribute("d") ?? "").matchAll(/M(\d+) (\d+)/g)
    ];
    expect(coords.length).toBeGreaterThan(0);
    for (const [, x, y] of coords) {
      expect(Number(x)).toBeGreaterThanOrEqual(4);
      expect(Number(y)).toBeGreaterThanOrEqual(4);
      expect(Number(x)).toBeLessThan(side - 4);
      expect(Number(y)).toBeLessThan(side - 4);
    }
  });

  it("вмещает длинный адрес своей службы", () => {
    // Размер кода подбирается под длину нарочно: закрепи мы его — однажды не
    // вместился бы чей-то длинный адрес, и это выглядело бы как поломка.
    const long = makePairingLink(
      "https://finance.очень-длинное-имя-домена.example.org:8443",
      "ABCD2345"
    );
    render(<PairingQr value={long} />);

    expect(screen.getByTestId("pairing-qr").querySelector("path")).toBeTruthy();
  });

  it("в картинке лежит ровно то, что прочитает второе устройство", () => {
    // Сторож на шов: рисуем одно, а понимаем другое — и камера «не читает».
    expect(readPairing(LINK)).toEqual({
      base: "https://finance.example.org",
      code: "ABCD2345"
    });
  });
});
