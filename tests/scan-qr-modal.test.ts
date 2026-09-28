// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

// Камера — будто на телефоне: иначе scanQr отвечает «absent» раньше проверки.
vi.mock("@/lib/platform/device", () => ({ isAndroidShell: () => true }));
const scan = vi.fn();
vi.mock("@tauri-apps/plugin-barcode-scanner", () => ({
  checkPermissions: vi.fn(async () => "granted"),
  requestPermissions: vi.fn(async () => "granted"),
  scan,
  cancel: vi.fn(async () => {}),
  Format: { QRCode: "QR_CODE" }
}));

import { modalOpen, scanQr, waitForNoModal } from "@/lib/sync/scan-qr";

afterEach(() => {
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.body.removeAttribute("data-scroll-locked");
  scan.mockReset();
});

// 2.2.0: сканер чека открывался поверх окна быстрого добавления — и телефон
// висел намертво. Камера поверх модального окна больше не открывается.
describe("камера и модальные окна", () => {
  it("видит открытое окно: по разметке и по тому, что оно делает со страницей", () => {
    expect(modalOpen()).toBe(false);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    expect(modalOpen()).toBe(true);
    dialog.remove();
    document.body.style.pointerEvents = "none";
    expect(modalOpen()).toBe(true);
  });

  it("поверх окна камеру не открывает", async () => {
    document.body.style.pointerEvents = "none";
    const shot = await scanQr();
    expect(shot).toEqual({ ok: false, why: "broken", detail: "modal dialog is open" });
    expect(scan).not.toHaveBeenCalled();
  });

  it("без окна — открывает", async () => {
    scan.mockResolvedValue({ content: "t=20260927T1530&s=100.00&fn=1&n=1" });
    const shot = await scanQr();
    expect(shot).toEqual({ ok: true, text: "t=20260927T1530&s=100.00&fn=1&n=1" });
  });

  it("ждёт, пока закрытое окно снимется со страницы", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    setTimeout(() => dialog.remove(), 100);
    await expect(waitForNoModal(1000)).resolves.toBe(true);
    expect(modalOpen()).toBe(false);
  });

  it("не ждёт вечно", async () => {
    document.body.style.pointerEvents = "none";
    await expect(waitForNoModal(100)).resolves.toBe(false);
  });
});
