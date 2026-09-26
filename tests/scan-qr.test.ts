// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Камера живёт только в мобильной сборке, и проверяется здесь не она, а то,
// как приложение обходится с её исходами. Их четыре, и три — не поломки:
// человек запретил доступ, человек закрыл видоискатель, камеры нет вовсе.

const { shell } = vi.hoisted(() => ({ shell: { android: false } }));

vi.mock("@/lib/platform/device", () => ({
  isAndroidShell: () => shell.android
}));

const { plugin } = vi.hoisted(() => ({
  plugin: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    scan: vi.fn(),
    cancel: vi.fn(),
    Format: { QRCode: "QR_CODE" }
  }
}));

vi.mock("@tauri-apps/plugin-barcode-scanner", () => plugin);

import { cameraPossible, scanQr } from "@/lib/sync/scan-qr";

beforeEach(() => {
  shell.android = true;
  plugin.checkPermissions.mockResolvedValue("granted");
  plugin.requestPermissions.mockResolvedValue("granted");
  plugin.cancel.mockResolvedValue(undefined);
  plugin.scan.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("камера", () => {
  it("на компьютере её не предлагают вовсе", async () => {
    // Предложить путь, которого нет, хуже, чем не предлагать ничего: человек
    // нажмёт и решит, что сломано приложение.
    shell.android = false;

    expect(cameraPossible()).toBe(false);
    expect(await scanQr()).toEqual({ ok: false, why: "absent" });
    expect(plugin.scan).not.toHaveBeenCalled();
  });

  it("прочитанное возвращается как есть", async () => {
    plugin.scan.mockResolvedValue({ content: " financeapps://pair?c=ABCD2345 " });

    expect(await scanQr()).toEqual({ ok: true, text: "financeapps://pair?c=ABCD2345" });
  });

  it("спрашивает разрешение до того, как открыть видоискатель", async () => {
    // Иначе человек видит чёрный прямоугольник и не понимает, чего от него хотят.
    plugin.checkPermissions.mockResolvedValue("prompt");
    plugin.requestPermissions.mockResolvedValue("granted");
    plugin.scan.mockResolvedValue({ content: "ABCD2345" });

    await scanQr();

    expect(plugin.requestPermissions).toHaveBeenCalled();
    const asked = plugin.requestPermissions.mock.invocationCallOrder[0];
    const opened = plugin.scan.mock.invocationCallOrder[0];
    expect(asked).toBeLessThan(opened);
  });

  it("запрет доступа — свой исход, а не «ошибка»", async () => {
    plugin.checkPermissions.mockResolvedValue("denied");
    plugin.requestPermissions.mockResolvedValue("denied");

    expect(await scanQr()).toEqual({ ok: false, why: "denied" });
    expect(plugin.scan).not.toHaveBeenCalled();
  });

  it("закрытый видоискатель — не ошибка и молчит", async () => {
    // Человек передумал. Ругаться на это нечем.
    plugin.scan.mockResolvedValue({ content: "" });

    expect(await scanQr()).toEqual({ ok: false, why: "cancelled" });
  });

  it("видоискатель снимается всегда, даже когда всё сорвалось", async () => {
    // Он делает страницу прозрачной. Не сняв его, мы оставили бы человека
    // смотреть сквозь приложение на камеру.
    plugin.scan.mockRejectedValue(new Error("камера отвалилась"));

    const outcome = await scanQr();

    expect(outcome).toEqual({ ok: false, why: "broken", detail: "камера отвалилась" });
    expect(plugin.cancel).toHaveBeenCalled();
  });

  it("просит только QR, а не всё подряд", async () => {
    // Сканер, хватающий штрихкод с пачки молока, будет хватать его и здесь —
    // а понять такое всё равно нечем.
    plugin.scan.mockResolvedValue({ content: "ABCD2345" });

    await scanQr();

    expect(plugin.scan.mock.calls[0][0].formats).toEqual(["QR_CODE"]);
  });

  it("пока камера снимает, страница прозрачна и поверх неё рамка с «Отменой»", async () => {
    // Плагин кладёт камеру ПОД страницу. В 2.0.0 страница оставалась закрашенной
    // фоном темы — камера работала, но человек её не видел и выйти было нечем.
    let seen: { scanning: boolean; layer: boolean } | null = null;
    plugin.scan.mockImplementation(async () => {
      seen = {
        scanning: document.documentElement.classList.contains("qr-scanning"),
        layer: Boolean(document.querySelector('[data-testid="qr-viewfinder"] button'))
      };
      return { content: "ABCD2345" };
    });

    await scanQr();

    expect(seen).toEqual({ scanning: true, layer: true });
    // После съёмки всё возвращается как было.
    expect(document.documentElement.classList.contains("qr-scanning")).toBe(false);
    expect(document.querySelector('[data-testid="qr-viewfinder"]')).toBeNull();
  });

  it("«Отмена» гасит камеру, и это не ошибка", async () => {
    let reject: (cause: Error) => void = () => {};
    plugin.scan.mockImplementation(
      () => new Promise((_, no) => (reject = no as (cause: Error) => void))
    );
    plugin.cancel.mockImplementation(async () => reject(new Error("cancelled")));

    const pending = scanQr();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="qr-viewfinder"] button')).not.toBeNull()
    );
    (document.querySelector('[data-testid="qr-viewfinder"] button') as HTMLButtonElement).click();

    expect(await pending).toEqual({ ok: false, why: "cancelled" });
    expect(document.querySelector('[data-testid="qr-viewfinder"]')).toBeNull();
  });
});
