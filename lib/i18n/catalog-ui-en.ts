// Словарь направления «ui» — английский. Подгружается вместе с основным
// английским (loadLocale в catalog.ts).

import type { Messages } from "@/lib/i18n/catalog";

export const en: Messages = {
  "ui.sheetImport.pastePlaceholder": "Month\tBalance\tIncome\tGroceries\t…",
  "ui.pairingQr.aria": "Pairing code as an image",
  "ui.rep.noPrevYear": "no data for {prev}"
};
