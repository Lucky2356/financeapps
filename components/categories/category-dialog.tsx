"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import type { CategoryRow } from "@/types/finance";

// Category swatches: a broad, readable spread across the hue circle in two
// tones (deep + light) so similar-looking categories can still be told apart.
export const PRESET_COLORS = [
  // Deep tones
  "#16a34a",
  "#0d9488",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#c026d3",
  "#db2777",
  "#e11d48",
  "#dc2626",
  "#ea580c",
  "#b45309",
  // Light / accent tones
  "#4ade80",
  "#2dd4bf",
  "#38bdf8",
  "#60a5fa",
  "#818cf8",
  "#a78bfa",
  "#e879f9",
  "#f472b6",
  "#fb7185",
  "#f97316",
  "#eab308",
  "#84cc16",
  // Neutrals
  "#64748b",
  "#334155"
];

// Shared create/edit form for a category. Lives in its own file so both the
// Categories page and the Budgets page (where limits are set per category) can
// offer the same dialog.
export function CategoryDialog({
  title,
  category,
  defaultKind,
  onSubmit
}: {
  title: string;
  category?: CategoryRow;
  defaultKind: "INCOME" | "EXPENSE";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  const [selectedColor, setSelectedColor] = useState(category?.color ?? PRESET_COLORS[0]);
  const [isEssential, setIsEssential] = useState(category?.isEssential ?? false);
  const [isSubscription, setIsSubscription] = useState(category?.isSubscription ?? false);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {category ? <input type="hidden" name="id" value={category.id} /> : null}
        <input type="hidden" name="kind" value={defaultKind} />
        <input type="hidden" name="color" value={selectedColor} />
        <input type="hidden" name="isEssential" value={String(isEssential)} />
        <input type="hidden" name="isSubscription" value={String(isSubscription)} />

        <div className="space-y-2">
          <Label>{t("common.name")}</Label>
          <Input
            name="name"
            defaultValue={category?.name ?? ""}
            minLength={2}
            maxLength={80}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>{t("cat.color")}</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="size-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: selectedColor === color ? "hsl(var(--foreground))" : "transparent"
                }}
                onClick={() => setSelectedColor(color)}
                aria-label={t("cat.colorAria", { color })}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="inline-block size-4 rounded-full border"
              style={{ backgroundColor: selectedColor }}
            />
            <span>{selectedColor}</span>
          </div>
        </div>

        {defaultKind === "EXPENSE" && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border accent-primary"
              checked={isEssential}
              onChange={(e) => setIsEssential(e.target.checked)}
            />
            <span>{t("cat.essentialFull")}</span>
          </label>
        )}

        {defaultKind === "EXPENSE" && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border accent-primary"
              checked={isSubscription}
              onChange={(e) => setIsSubscription(e.target.checked)}
            />
            <span>{t("cat.subscriptionFull")}</span>
          </label>
        )}

        <DialogFooter>
          <Button type="submit">{t("common.save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
