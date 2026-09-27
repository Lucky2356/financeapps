// Когда показывать «Что нового».
//
// Один раз после обновления — не до. «До» — это обещание: обновление может и
// не встать, а человек уже прочитал про то, чего у него нет. «После» — про то,
// что уже в руках, и это можно сразу попробовать. Перед обновлением хватает
// одной строки-итога в предложении обновиться.

import { compareVersions } from "@/lib/updates/latest";
import type { WhatsNewRelease } from "@/lib/whats-new/parse";

/** Какую версию человек уже видел в «Что нового». Хранится через readMine. */
export const WHATS_NEW_KEY = "whats-new-seen";

/** Больше пяти выпусков разом — это уже не «что нового», а история. */
export const MAX_RELEASES = 5;

export type WhatsNewDecision =
  | { show: false; remember: boolean }
  | { show: true; releases: WhatsNewRelease[] };

/**
 * Решить, что показать.
 *
 * - `seen` — версия из хранилища или null, если ключа нет;
 * - `onboarded` — пройдено ли обучение (или первый экран). Нет ключа и нет
 *   обучения — это новая установка: ей нечего сообщать «нового», всё новое.
 *   Нет ключа, но обучение пройдено — человек обновился с версии, где этого
 *   окна ещё не было: ему показать текущий выпуск.
 */
export function decideWhatsNew(input: {
  seen: string | null;
  current: string;
  onboarded: boolean;
  releases: WhatsNewRelease[];
}): WhatsNewDecision {
  const { seen, current, onboarded, releases } = input;
  // Идёт обучение (новая установка или «Показать обучение снова») — два окна
  // разом не нужны. Новую установку запоминаем сразу: ей всё новое.
  if (!onboarded) return { show: false, remember: !seen };
  if (!seen) {
    const now = releases.find((release) => release.version === current);
    return now ? { show: true, releases: [now] } : { show: false, remember: true };
  }
  if (compareVersions(seen, current) >= 0) return { show: false, remember: false };
  const fresh = releases
    .filter(
      (release) =>
        compareVersions(release.version, seen) > 0 && compareVersions(release.version, current) <= 0
    )
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, MAX_RELEASES);
  // Выпуска нет в CHANGELOG (сборка «между» выпусками) — запомнить молча, чтобы
  // не спрашивать при каждом запуске.
  return fresh.length > 0 ? { show: true, releases: fresh } : { show: false, remember: true };
}
