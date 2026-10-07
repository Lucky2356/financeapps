"use client";

import { useState } from "react";

import { useIncludeTransfers } from "@/hooks/use-include-transfers";
import { readStartScreen, readTextSize, type StartScreen, type TextSize } from "@/lib/preferences";
import { DEFAULT_ACCOUNT_KEY, readMine } from "@/lib/storage/mine";

/** Житейские настройки этого устройства для раздела «Основные». */
export function useDevicePreferences() {
  const [homeTransfers, setHomeTransfers] = useIncludeTransfers("home");
  // Житейские настройки этого устройства (lib/preferences.ts). Скрытые суммы и
  // копейки перерисовывают экраны сами — через событие, — поэтому здесь их
  // достаточно прочитать; остальные три помнятся тут же.
  const [textSize, setTextSizeState] = useState<TextSize>(readTextSize);
  const [startScreen, setStartScreenState] = useState<StartScreen>(readStartScreen);
  const [defaultAccount, setDefaultAccount] = useState(() => readMine(DEFAULT_ACCOUNT_KEY) ?? "");

  return {
    homeTransfers,
    setHomeTransfers,
    textSize,
    setTextSizeState,
    startScreen,
    setStartScreenState,
    defaultAccount,
    setDefaultAccount
  };
}

export type DevicePreferences = ReturnType<typeof useDevicePreferences>;
