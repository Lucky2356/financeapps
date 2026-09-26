"use client";

// «Подключено новое устройство» — на остальных устройствах.
//
// Связка по QR быстрая и без паролей, и это же её риск: снятый из-за плеча код
// подключает чужое устройство к вашим данным. Хозяин должен об этом узнать, и
// не когда зайдёт в «Мои устройства», а сразу. Поэтому при запуске и потом раз
// в четверть часа приложение сверяет список устройств с тем, что видело в
// прошлый раз, и о каждом новом говорит вслух — с кнопкой туда, где лишнее
// устройство выкидывается.

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { SERVER_LINK_CHANGED } from "@/components/settings/server-panel";
import { useI18n } from "@/lib/i18n/context";
import { KNOWN_DEVICES_KEY, readMine, writeMine } from "@/lib/storage/mine";
import { serverAccount } from "@/lib/vault/runtime";

const EVERY_MS = 15 * 60 * 1000;

type Known = { login: string; ids: string[] };

function readKnown(): Known | null {
  try {
    const raw = readMine(KNOWN_DEVICES_KEY);
    return raw ? (JSON.parse(raw) as Known) : null;
  } catch {
    return null;
  }
}

/** Что нового с прошлого раза. Первый раз — ничего: всё, что есть, уже своё. */
export function newDevices(
  before: Known | null,
  login: string,
  now: Array<{ id: string; name: string }>,
  current: string | null
): Array<{ id: string; name: string }> {
  if (!before || before.login !== login) return [];
  return now.filter((device) => device.id !== current && !before.ids.includes(device.id));
}

export function NewDeviceWatch() {
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    async function check(announce: boolean) {
      const link = await serverAccount.link().catch(() => null);
      if (!link) return;
      const list = await serverAccount.devices().catch(() => null);
      if (!list || !alive) return;
      const fresh = announce ? newDevices(readKnown(), link.login, list.devices, list.current) : [];
      writeMine(
        KNOWN_DEVICES_KEY,
        JSON.stringify({ login: link.login, ids: list.devices.map((device) => device.id) })
      );
      for (const device of fresh) {
        toast.warning(t("sync2.newDevice.title", { name: device.name }), {
          description: t("sync2.newDevice.desc"),
          duration: 30_000,
          action: {
            label: t("sync2.newDevice.open"),
            onClick: () => router.push("/settings?section=sync")
          }
        });
      }
    }

    void check(true);
    const timer = window.setInterval(() => void check(true), EVERY_MS);
    // Подключили с ЭТОГО устройства — оно и так это видело: запомнить молча.
    const quiet = () => void check(false);
    window.addEventListener(SERVER_LINK_CHANGED, quiet);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(SERVER_LINK_CHANGED, quiet);
    };
  }, [router, t]);

  return null;
}
