"use client";

// «Кто платил» и «Общая трата» в форме операции.
//
// Видно, только когда в семье кто-то есть: тем, кто ведёт деньги один, лишние
// кнопки ни к чему. Новая операция сразу помечена тем, чьё это устройство
// (выбирается на экране «Семья»), — на своём телефоне себя выбирать не надо.
// В форму уходят скрытые поля: и быстрое добавление, и правка шлют FormData.

import { useState } from "react";

import { useApiPageData } from "@/hooks/use-api-page-data";
import type { FamilyPicture, Member } from "@/lib/family/family";
import { useI18n } from "@/lib/i18n/context";
import { readMine } from "@/lib/storage/mine";
import { cn } from "@/lib/utils";

/** Чьё это устройство — у каждого человека на устройстве своё. */
export const FAMILY_ME_KEY = "family-me";

/**
 * Чья трата, записанная с этого устройства без формы (частые траты, ИИ,
 * уведомление банка): участник этого устройства. Расход — да, доход — нет:
 * «кто платил» бывает только у траты.
 */
export function deviceMember(type: string): { memberId?: string } {
  const memberId = type === "EXPENSE" ? readMine(FAMILY_ME_KEY) : null;
  return memberId ? { memberId } : {};
}

export type FamilyPage = { members: Member[]; picture: FamilyPicture | null };

export const EMPTY_FAMILY: FamilyPage = { members: [], picture: null };

export function useFamilyMembers(): Member[] {
  const { data } = useApiPageData(EMPTY_FAMILY, "/family");
  return data?.members ?? [];
}

export function FamilyFields({
  initialMemberId,
  initialShared,
  isNew
}: {
  initialMemberId?: string;
  initialShared?: boolean;
  isNew: boolean;
}) {
  const { t } = useI18n();
  const members = useFamilyMembers();
  // null — человек ничего не трогал: тогда работает подсказка по умолчанию.
  const [choice, setChoice] = useState<string | null>(null);
  const [shared, setShared] = useState(Boolean(initialShared));
  if (members.length === 0) return null;

  const known = (value: string | null | undefined) =>
    value && members.some((member) => member.id === value) ? value : "";
  const fallback = isNew ? known(readMine(FAMILY_ME_KEY)) : known(initialMemberId);
  const memberId = choice ?? fallback;
  const canShare = memberId !== "" && members.length > 1;

  return (
    <div className="space-y-2" data-testid="family-fields">
      <p className="text-sm font-medium" id="family-who">
        {t("family.who")}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="family-who">
        {members.map((member) => {
          const active = member.id === memberId;
          return (
            <button
              key={member.id}
              type="button"
              aria-pressed={active}
              onClick={() => setChoice(active ? "" : member.id)}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                active
                  ? "border-foreground bg-foreground/[0.08] font-medium text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              )}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: member.color }}
              />
              {member.name}
            </button>
          );
        })}
      </div>
      {canShare ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[hsl(var(--primary))]"
            checked={shared}
            onChange={(event) => setShared(event.target.checked)}
            data-testid="family-shared"
          />
          {t("family.shared")}
        </label>
      ) : null}
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="shared" value={canShare && shared ? "1" : "0"} />
    </div>
  );
}
