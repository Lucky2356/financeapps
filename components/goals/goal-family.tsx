"use client";

// Совместная цель семьи на экране целей (lib/family/goal-shares.ts): кто сколько
// внёс, кто отстаёт от своей доли; доли — в окне цели; «кто вносит» — в окне
// пополнения. Видно только тем, у кого в «Семье» двое и больше.

import { useState } from "react";

import { useFamilyMembers } from "@/components/family/family-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GoalFamily } from "@/lib/family/goal-shares";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function GoalFamilyLine({
  family,
  currency
}: {
  family: GoalFamily | null | undefined;
  currency: string;
}) {
  const { t } = useI18n();
  if (!family) return null;
  const money = (value: number) => formatCurrency(value, currency);
  const lagging = family.members.filter((member) => member.behind >= 1);
  return (
    <div className="mt-3 space-y-1.5 text-sm" data-testid="goal-family">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {family.members.map((member) => (
          <span key={member.id} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: member.color }}
            />
            {member.name}
            <b className="tabular-nums">{money(member.contributed)}</b>
            <span className="text-xs text-muted-foreground">
              {t("gf.share", { pct: Math.round(member.share) })}
            </span>
          </span>
        ))}
        {family.unassigned > 0 ? (
          <span className="text-muted-foreground">
            {t("gf.unassigned", { amount: money(family.unassigned) })}
          </span>
        ) : null}
      </div>
      {lagging.map((member) => (
        <p key={member.id} className="text-xs text-warning" data-testid="goal-family-behind">
          {t("gf.behind", { name: member.name, amount: money(member.behind) })}
        </p>
      ))}
    </div>
  );
}

/** «Кто вносит» в окне пополнения: участники кнопками, по умолчанию — этого устройства. */
export function GoalMemberPicker({
  value,
  onChange
}: {
  value: string;
  onChange: (memberId: string) => void;
}) {
  const { t } = useI18n();
  const members = useFamilyMembers();
  if (members.length < 2) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" id="goal-who">
        {t("gf.who")}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="goal-who">
        {members.map((member) => {
          const active = member.id === value;
          return (
            <button
              key={member.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? "" : member.id)}
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
    </div>
  );
}

/** Доли в окне цели: поровну или свои проценты. В форму — скрытое поле shares (JSON). */
export function GoalSharesFields({ shares }: { shares?: Record<string, number> }) {
  const { t } = useI18n();
  const members = useFamilyMembers();
  const [custom, setCustom] = useState(Boolean(shares && Object.keys(shares).length > 0));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(shares ?? {}).map(([id, value]) => [id, String(value)]))
  );
  if (members.length < 2) return null;
  const payload = custom
    ? Object.fromEntries(
        members
          .map((member) => [member.id, Number(values[member.id] ?? 0)] as const)
          .filter(([, value]) => Number.isFinite(value) && value > 0)
      )
    : {};
  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="goal-shares">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[hsl(var(--primary))]"
          checked={custom}
          onChange={(event) => setCustom(event.target.checked)}
        />
        {t("gf.custom")}
      </label>
      {custom ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((member) => (
            <div key={member.id} className="grid gap-1">
              <Label htmlFor={`share-${member.id}`}>{t("gf.shareOf", { name: member.name })}</Label>
              <Input
                id={`share-${member.id}`}
                inputMode="decimal"
                value={values[member.id] ?? ""}
                placeholder="50"
                onChange={(event) =>
                  setValues((was) => ({ ...was, [member.id]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("gf.equal")}</p>
      )}
      <input type="hidden" name="shares" value={JSON.stringify(payload)} />
    </div>
  );
}
